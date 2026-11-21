import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { MedPulseLogo } from '@/components/MedPulseLogo';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';

export default function AboutScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MedPulseLogo size={84} />
        <Text style={[styles.appName, { color: colors.text }]}>{t('app.name')}</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          {t('app.tagline')}
        </Text>
        <Text style={[styles.credit, { color: colors.text }]}>
          {t('app.versionCredit')}
        </Text>
        <Text style={[styles.securityNote, { color: colors.textSecondary }]}>
          {t('more.aboutSecurityNote')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: space(2),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(3),
    alignItems: 'center',
    gap: space(1.5),
  },
  appName: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  tagline: {
    fontSize: type.body,
    textAlign: 'center',
  },
  credit: {
    fontSize: type.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  securityNote: {
    fontSize: type.small,
    textAlign: 'center',
    lineHeight: 20,
  },
});
