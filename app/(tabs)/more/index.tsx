import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export default function MoreScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { profile, userEmail, signOut } = useAuth();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: colors.text }]}>{t('more.title')}</Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            {t('more.accountSection')}
          </Text>
          <Text style={[styles.userName, { color: colors.text }]}>
            {profile?.full_name ?? t('app.name')}
          </Text>
          <Text style={[styles.userMeta, { color: colors.textSecondary }]}>
            {profile ? t(`roles.${profile.role}`) : ''}
            {userEmail ? ` · ${userEmail}` : ''}
          </Text>
        </View>

        <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push('/(tabs)/more/reports')}
            accessibilityRole="button"
            accessibilityLabel={t('more.reports')}
            style={styles.menuRow}
          >
            <MaterialCommunityIcons name="chart-box-outline" size={24} color={colors.primary} />
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>{t('more.reports')}</Text>
              <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>
                {t('more.reportsSubtitle')}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => router.push('/(tabs)/more/settings')}
            accessibilityRole="button"
            accessibilityLabel={t('more.settings')}
            style={styles.menuRow}
          >
            <MaterialCommunityIcons name="cog-outline" size={24} color={colors.primary} />
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>{t('more.settings')}</Text>
              <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>
                {t('more.settingsSubtitle')}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => router.push('/(tabs)/more/about')}
            accessibilityRole="button"
            accessibilityLabel={t('more.about')}
            style={styles.menuRow}
          >
            <MaterialCommunityIcons name="information-outline" size={24} color={colors.primary} />
            <View style={styles.menuTextWrap}>
              <Text style={[styles.menuTitle, { color: colors.text }]}>{t('more.about')}</Text>
              <Text style={[styles.menuSubtitle, { color: colors.textSecondary }]}>
                {t('more.aboutSubtitle')}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel={t('auth.signOut')}
          style={({ pressed }) => [
            styles.signOutButton,
            { backgroundColor: pressed ? colors.critical : colors.primary },
          ]}
        >
          <Text style={[styles.signOutLabel, { color: colors.onPrimary }]}>
            {t('auth.signOut')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    padding: space(2),
    gap: space(2),
  },
  heading: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(0.5),
  },
  sectionLabel: {
    fontSize: type.small,
    fontWeight: '600',
  },
  userName: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  userMeta: {
    fontSize: type.small,
  },
  menuCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuRow: {
    minHeight: touchTarget.counter,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    gap: space(1.5),
  },
  menuTextWrap: {
    flex: 1,
  },
  menuTitle: {
    fontSize: type.body,
    fontWeight: '700',
  },
  menuSubtitle: {
    fontSize: type.small,
  },
  divider: {
    height: 1,
  },
  signOutButton: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutLabel: {
    fontSize: type.body,
    fontWeight: '700',
  },
});
