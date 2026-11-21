import { Platform } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type HospitalRow = Database['public']['Tables']['hospitals']['Row'];
export type LocationRow = Database['public']['Tables']['locations']['Row'];

export type AuthErrorKind =
  | 'supabase_not_configured'
  | 'invalid_email'
  | 'invalid_otp'
  | 'rate_limit'
  | 'user_not_found'
  | 'unknown';

export type AccessContextResult =
  | {
      status: 'authenticated';
      profile: ProfileRow;
      hospital: HospitalRow;
      locations: LocationRow[];
      primaryLocationId: string;
    }
  | {
      status: 'no_role';
      profile: ProfileRow | null;
      hospital: HospitalRow | null;
      locations: [];
      primaryLocationId: null;
    };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6,8}$/;

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function validateOtp(otp: string): boolean {
  return OTP_REGEX.test(otp.trim());
}

/**
 * Classifies auth errors thrown by client validation or Supabase GoTrue into
 * stable categories so the UI can display actionable messages.
 */
export function classifyAuthError(err: unknown): AuthErrorKind {
  const errObj = err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
  const message = errObj && typeof errObj.message === 'string' ? errObj.message : '';
  const code = errObj && typeof errObj.code === 'string' ? errObj.code : '';
  const status = errObj && typeof errObj.status === 'number' ? errObj.status : undefined;

  if (message === 'SUPABASE_NOT_CONFIGURED') {
    return 'supabase_not_configured';
  }
  if (message === 'INVALID_EMAIL') {
    return 'invalid_email';
  }
  if (message === 'INVALID_OTP') {
    return 'invalid_otp';
  }
  if (
    code === 'over_email_send_rate_limit' ||
    status === 429 ||
    /rate limit|too many requests|can only request this after/i.test(message)
  ) {
    return 'rate_limit';
  }
  if (code === 'otp_disabled' || /signups not allowed/i.test(message)) {
    return 'user_not_found';
  }
  return 'unknown';
}

export async function sendEmailOtp(email: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }
  const normalized = email.trim().toLowerCase();
  if (!validateEmail(normalized)) {
    throw new Error('INVALID_EMAIL');
  }
  const emailRedirectTo =
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
    },
  });
  if (error) {
    throw error;
  }
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }
  const normalized = email.trim().toLowerCase();
  if (!validateEmail(normalized)) {
    throw new Error('INVALID_EMAIL');
  }
  if (!password) {
    throw new Error('INVALID_PASSWORD');
  }
  const { error } = await supabase.auth.signInWithPassword({
    email: normalized,
    password,
  });
  if (error) {
    throw error;
  }
}

export async function verifyEmailOtp(email: string, otp: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedOtp = otp.trim();
  if (!validateEmail(normalizedEmail)) {
    throw new Error('INVALID_EMAIL');
  }
  if (!validateOtp(normalizedOtp)) {
    throw new Error('INVALID_OTP');
  }
  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedOtp,
    type: 'email',
  });
  if (error) {
    throw error;
  }
}

export async function recordAuthEvent(
  action: 'auth.sign_in' | 'auth.sign_out' | 'auth.reauth',
  metadata: Json = {},
  client: SupabaseClient<Database> = supabase,
): Promise<void> {
  if (!isSupabaseConfigured && client === supabase) {
    return;
  }
  const { error } = await client.rpc('record_auth_event', {
    p_action: action,
    p_metadata: metadata,
  });
  if (error) {
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }
  try {
    await recordAuthEvent('auth.sign_out', { source: 'mobile_app' });
  } catch {
    // Do not block sign-out if user lacks an active profile or network is offline
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

/**
 * Loads the user's profile, hospital, and assigned locations (MP-AUTH-002).
 * Any user lacking an active profile or at least one assigned location is
 * returned as `no_role` and blocked from data screens.
 */
export async function loadAccessContext(
  userId: string,
  client: SupabaseClient<Database> = supabase,
): Promise<AccessContextResult> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, hospital_id, full_name, role, locale, is_active, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile || !profile.is_active) {
    return {
      status: 'no_role',
      profile: null,
      hospital: null,
      locations: [],
      primaryLocationId: null,
    };
  }

  const [{ data: hospital, error: hospitalError }, { data: assignments, error: assignError }] =
    await Promise.all([
      client
        .from('hospitals')
        .select('id, name, code, idle_timeout_minutes, created_at')
        .eq('id', profile.hospital_id)
        .maybeSingle(),
      client
        .from('user_locations')
        .select('location_id')
        .eq('user_id', userId),
    ]);

  if (hospitalError) {
    throw hospitalError;
  }
  if (assignError) {
    throw assignError;
  }

  if (!hospital || !assignments || assignments.length === 0) {
    return {
      status: 'no_role',
      profile,
      hospital: hospital ?? null,
      locations: [],
      primaryLocationId: null,
    };
  }

  const { data: locations, error: locationsError } = await client
    .from('locations')
    .select('id, hospital_id, parent_id, name, type, created_at')
    .eq('hospital_id', profile.hospital_id)
    .order('name', { ascending: true });

  if (locationsError) {
    throw locationsError;
  }

  const visibleLocations = locations ?? [];
  if (visibleLocations.length === 0) {
    return {
      status: 'no_role',
      profile,
      hospital,
      locations: [],
      primaryLocationId: null,
    };
  }

  const assignedIdSet = new Set(assignments.map((a) => a.location_id));
  const primaryMatch =
    visibleLocations.find((loc) => assignedIdSet.has(loc.id)) ?? visibleLocations[0];

  return {
    status: 'authenticated',
    profile,
    hospital,
    locations: visibleLocations,
    primaryLocationId: primaryMatch.id,
  };
}
