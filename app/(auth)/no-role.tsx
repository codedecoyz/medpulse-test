import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export default function NoRoleScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { userEmail, signOut, refreshAccess } = useAuth();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MaterialCommunityIcons name="shield-alert-outline" size={44} color={colors.critical} />
          <Text style={[styles.title, { color: colors.text }]}>{t('auth.noRoleTitle')}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {t('auth.noRoleMessage')}
          </Text>
          {userEmail ? (
            <Text style={[styles.email, { color: colors.text }]}>{userEmail}</Text>
          ) : null}

          <Pressable
            onPress={() => void refreshAccess()}
            accessibilityRole="button"
            accessibilityLabel={t('common.refresh')}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: pressed ? colors.border : colors.healthy,
              },
            ]}
          >
            <Text style={[styles.secondaryLabel, { color: colors.onHealthy }]}>
              {t('common.refresh')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => void signOut()}
            accessibilityRole="button"
            accessibilityLabel={t('auth.signOut')}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: pressed ? colors.critical : colors.primary,
              },
            ]}
          >
            <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>
              {t('auth.signOut')}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: space(3),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(3),
    alignItems: 'center',
    gap: space(1.5),
  },
  title: {
    fontSize: type.h2,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: type.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  email: {
    fontSize: type.small,
    fontWeight: '600',
  },
  primaryButton: {
    width: '100%',
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: type.body,
    fontWeight: '700',
  },
  secondaryButton: {
    width: '100%',
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: type.body,
    fontWeight: '700',
  },
});
