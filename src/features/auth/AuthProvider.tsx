import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { changeAppLanguage } from '@/lib/i18n';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  type HospitalRow,
  type LocationRow,
  type ProfileRow,
  loadAccessContext,
  recordAuthEvent,
  sendEmailOtp,
  signInWithPassword as signInWithPasswordService,
  signOutUser,
  verifyEmailOtp,
} from './authService';
import { DEFAULT_IDLE_TIMEOUT_MINUTES, isIdleExpired } from './idleTimeout';

export type AuthStatus = 'loading' | 'unauthenticated' | 'no_role' | 'locked' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  userEmail: string | null;
  profile: ProfileRow | null;
  hospital: HospitalRow | null;
  locations: LocationRow[];
  activeLocationId: string | null;
  setActiveLocationId: (locationId: string) => void;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  unlockWithOtp: (otp: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseConfigured ? 'loading' : 'unauthenticated',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [hospital, setHospital] = useState<HospitalRow | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const backgroundedAtRef = useRef<number | null>(null);

  const applySession = useCallback(async (nextSession: Session | null, eventType?: string) => {
    setSession(nextSession);

    if (!nextSession?.user) {
      setProfile(null);
      setHospital(null);
      setLocations([]);
      setActiveLocationId(null);
      setStatus('unauthenticated');
      return;
    }

    try {
      const ctx = await loadAccessContext(nextSession.user.id);
      if (ctx.status === 'no_role') {
        setProfile(ctx.profile);
        setHospital(ctx.hospital);
        setLocations([]);
        setActiveLocationId(null);
        setStatus('no_role');
        return;
      }

      setProfile(ctx.profile);
      setHospital(ctx.hospital);
      setLocations(ctx.locations);
      setActiveLocationId((prev) =>
        prev && ctx.locations.some((loc) => loc.id === prev) ? prev : ctx.primaryLocationId,
      );
      await changeAppLanguage(ctx.profile.locale);
      setStatus('authenticated');

      if (eventType === 'SIGNED_IN') {
        try {
          await recordAuthEvent('auth.sign_in', { method: 'email_otp' });
        } catch {
          // Non-fatal if offline or transient error
        }
      }
    } catch {
      setProfile(null);
      setHospital(null);
      setLocations([]);
      setActiveLocationId(null);
      setStatus('no_role');
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        void applySession(data.session);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        void applySession(nextSession, event);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAtRef.current = Date.now();
        return;
      }

      if (nextState === 'active' && status === 'authenticated') {
        const timeoutMinutes = hospital?.idle_timeout_minutes ?? DEFAULT_IDLE_TIMEOUT_MINUTES;
        if (isIdleExpired(backgroundedAtRef.current, Date.now(), timeoutMinutes)) {
          setStatus('locked');
        }
        backgroundedAtRef.current = null;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [hospital?.idle_timeout_minutes, status]);

  const sendOtp = useCallback(async (email: string) => {
    await sendEmailOtp(email);
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    await verifyEmailOtp(email, otp);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    await signInWithPasswordService(email, password);
  }, []);

  const unlockWithOtp = useCallback(
    async (otp: string) => {
      const email = session?.user?.email;
      if (!email) {
        setStatus('unauthenticated');
        return;
      }
      await verifyEmailOtp(email, otp);
      try {
        await recordAuthEvent('auth.reauth', { method: 'email_otp' });
      } catch {
        // Ignore transient audit failures during unlock
      }
      backgroundedAtRef.current = null;
      setStatus('authenticated');
    },
    [session?.user?.email],
  );

  const signOut = useCallback(async () => {
    await signOutUser();
    setSession(null);
    setProfile(null);
    setHospital(null);
    setLocations([]);
    setActiveLocationId(null);
    setStatus('unauthenticated');
  }, []);

  const refreshAccess = useCallback(async () => {
    await applySession(session);
  }, [applySession, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      userEmail: session?.user?.email ?? null,
      profile,
      hospital,
      locations,
      activeLocationId,
      setActiveLocationId,
      sendOtp,
      verifyOtp,
      signInWithPassword,
      unlockWithOtp,
      signOut,
      refreshAccess,
    }),
    [
      activeLocationId,
      hospital,
      locations,
      profile,
      refreshAccess,
      sendOtp,
      session,
      signInWithPassword,
      signOut,
      status,
      unlockWithOtp,
      verifyOtp,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
