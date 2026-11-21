import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { MedPulseLogo } from '@/components/MedPulseLogo';
import { useAuth } from '@/features/auth/AuthProvider';
import { classifyAuthError, validateEmail, validateOtp } from '@/features/auth/authService';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

const DEV_QUICK_ROLES = [
  { key: 'admin', email: 'admin@medpulse.local', labelKey: 'roles.admin' },
  { key: 'store_manager', email: 'store@medpulse.local', labelKey: 'roles.store_manager' },
  { key: 'pharmacist', email: 'pharmacist@medpulse.local', labelKey: 'roles.pharmacist' },
  { key: 'nurse', email: 'nurse@medpulse.local', labelKey: 'roles.nurse' },
  { key: 'coordinator', email: 'coordinator@medpulse.local', labelKey: 'roles.coordinator' },
  { key: 'auditor', email: 'auditor@medpulse.local', labelKey: 'roles.auditor' },
] as const;

export default function LoginScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { status, userEmail, sendOtp, verifyOtp, signInWithPassword, unlockWithOtp, signOut } =
    useAuth();

  const isLocked = status === 'locked';
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const effectiveEmail = isLocked ? (userEmail ?? '') : email.trim().toLowerCase();

  const mapAuthError = (err: unknown, fallbackKey: string): string => {
    switch (classifyAuthError(err)) {
      case 'supabase_not_configured':
        return t('auth.supabaseNotConfigured');
      case 'invalid_email':
        return t('auth.invalidEmail');
      case 'invalid_otp':
        return t('auth.invalidOtp');
      case 'rate_limit':
        return t('auth.otpRateLimited');
      case 'user_not_found':
        return t('auth.emailNotRegistered');
      case 'unknown': {
        const base = t(fallbackKey);
        const msg =
          err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message.trim()
            : '';
        return __DEV__ && msg ? `${base} (${msg})` : base;
      }
    }
  };

  const handleSendOtp = async () => {
    setErrorMsg(null);
    if (!validateEmail(effectiveEmail)) {
      setErrorMsg(t('auth.invalidEmail'));
      return;
    }

    setSubmitting(true);
    try {
      await sendOtp(effectiveEmail);
      setStep('otp');
    } catch (err) {
      setErrorMsg(mapAuthError(err, 'auth.otpSendFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMsg(null);
    if (!validateOtp(otp)) {
      setErrorMsg(t('auth.invalidOtp'));
      return;
    }

    setSubmitting(true);
    try {
      if (isLocked) {
        await unlockWithOtp(otp);
      } else {
        await verifyOtp(effectiveEmail, otp);
      }
      setOtp('');
    } catch (err) {
      setErrorMsg(mapAuthError(err, 'auth.otpVerifyFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevSignIn = async (devEmail: string) => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await signInWithPassword(devEmail, 'medpulse-dev-only');
    } catch (err) {
      setErrorMsg(mapAuthError(err, 'auth.passwordSignInFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const activeStep = isLocked ? 'otp' : step;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandBlock}>
            <MedPulseLogo size={80} />
            <Text style={[styles.title, { color: colors.text }]}>{t('app.name')}</Text>
            <Text style={[styles.tagline, { color: colors.textSecondary }]}>
              {t('app.tagline')}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isLocked ? (
              <View style={styles.lockHeader}>
                <Text style={[styles.cardTitle, { color: colors.critical }]}>
                  {t('auth.idleLockTitle')}
                </Text>
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                  {t('auth.idleLockMessage')}
                </Text>
              </View>
            ) : null}

            {errorMsg ? (
              <View
                style={[styles.errorBanner, { backgroundColor: colors.critical }]}
                accessible
                accessibilityRole="alert"
                testID="login-error-banner"
              >
                <MaterialCommunityIcons
                  name="alert-octagon-outline"
                  size={20}
                  color={colors.onCritical}
                />
                <Text style={[styles.errorText, { color: colors.onCritical }]}>{errorMsg}</Text>
              </View>
            ) : null}

            {activeStep === 'email' ? (
              <View style={styles.formGap}>
                <Text style={[styles.label, { color: colors.text }]}>
                  {t('auth.emailLabel')}
                </Text>
                <TextInput
                  testID="login-email-input"
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  accessibilityLabel={t('auth.emailLabel')}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceSoft,
                    },
                  ]}
                />
                <Pressable
                  testID="login-send-otp-btn"
                  onPress={handleSendOtp}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={t('auth.sendOtp')}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: pressed ? colors.critical : colors.primary,
                      opacity: submitting ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                    {submitting ? t('auth.sendingOtp') : t('auth.sendOtp')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.formGap}>
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                  {t('auth.otpPrompt', { email: effectiveEmail })}
                </Text>
                <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                  {t('auth.magicLinkHint')}
                </Text>
                <Text style={[styles.label, { color: colors.text }]}>{t('auth.otpLabel')}</Text>
                <TextInput
                  testID="login-otp-input"
                  value={otp}
                  onChangeText={setOtp}
                  placeholder={t('auth.otpPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  maxLength={8}
                  textContentType="oneTimeCode"
                  accessibilityLabel={t('auth.otpLabel')}
                  style={[
                    styles.input,
                    styles.otpInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceSoft,
                    },
                  ]}
                />
                <Pressable
                  testID="login-verify-otp-btn"
                  onPress={handleVerifyOtp}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel={isLocked ? t('auth.unlockButton') : t('auth.verifyOtp')}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: pressed ? colors.critical : colors.primary,
                      opacity: submitting ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                    {submitting
                      ? t('auth.verifyingOtp')
                      : isLocked
                        ? t('auth.unlockButton')
                        : t('auth.verifyOtp')}
                  </Text>
                </Pressable>

                <View style={styles.secondaryActions}>
                  <Pressable
                    onPress={handleSendOtp}
                    disabled={submitting}
                    accessibilityRole="button"
                    style={styles.linkButton}
                  >
                    <Text style={[styles.linkText, { color: colors.link }]}>
                      {t('auth.resendOtp')}
                    </Text>
                  </Pressable>
                  {isLocked ? (
                    <Pressable
                      onPress={() => void signOut()}
                      accessibilityRole="button"
                      style={styles.linkButton}
                    >
                      <Text style={[styles.linkText, { color: colors.link }]}>
                        {t('auth.signOut')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setStep('email');
                        setOtp('');
                        setErrorMsg(null);
                      }}
                      accessibilityRole="button"
                      style={styles.linkButton}
                    >
                      <Text style={[styles.linkText, { color: colors.link }]}>
                        {t('auth.changeEmail')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>

          {__DEV__ && !isLocked && activeStep === 'email' ? (
            <View
              style={[
                styles.card,
                styles.devCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.devTitle, { color: colors.text }]}>
                {t('auth.devQuickSignInTitle')}
              </Text>
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                {t('auth.devQuickSignInSubtitle')}
              </Text>
              <View style={styles.devGrid}>
                {DEV_QUICK_ROLES.map((item) => (
                  <Pressable
                    key={item.key}
                    testID={`dev-login-${item.key}`}
                    onPress={() => void handleDevSignIn(item.email)}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel={t(item.labelKey)}
                    style={({ pressed }) => [
                      styles.devChip,
                      {
                        backgroundColor: pressed ? colors.border : colors.surfaceSoft,
                        borderColor: colors.border,
                        opacity: submitting ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.devChipText, { color: colors.text }]}>
                      {t(item.labelKey)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <Text style={[styles.footer, { color: colors.textSecondary }]}>
            {t('app.credit')}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    padding: space(3),
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: space(3),
    marginBottom: space(2),
  },
  title: {
    fontSize: type.h1,
    fontWeight: '800',
    marginTop: space(1.5),
  },
  tagline: {
    fontSize: type.body,
    textAlign: 'center',
    marginTop: space(0.5),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2.5),
    gap: space(1.5),
  },
  lockHeader: {
    gap: space(0.5),
  },
  cardTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  formGap: {
    gap: space(1.5),
  },
  label: {
    fontSize: type.small,
    fontWeight: '600',
  },
  helperText: {
    fontSize: type.small,
    lineHeight: 20,
  },
  input: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    fontSize: type.body,
  },
  otpInput: {
    letterSpacing: 6,
    fontWeight: '700',
    fontSize: type.h2,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(2),
  },
  primaryButtonText: {
    fontSize: type.body,
    fontWeight: '700',
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space(1),
  },
  linkButton: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: space(0.5),
  },
  linkText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space(1.5),
    borderRadius: radius.button,
    gap: space(1),
  },
  errorText: {
    flex: 1,
    fontSize: type.small,
    fontWeight: '600',
  },
  footer: {
    fontSize: type.small,
    textAlign: 'center',
    marginTop: space(3),
    marginBottom: space(1),
  },
  devCard: {
    marginTop: space(2),
    gap: space(1),
  },
  devTitle: {
    fontSize: type.body,
    fontWeight: '700',
  },
  devGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
    marginTop: space(0.5),
  },
  devChip: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  devChipText: {
    fontSize: type.small,
    fontWeight: '600',
  },
});
