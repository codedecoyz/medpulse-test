import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export type ScreenStateKind = 'loading' | 'empty' | 'error' | 'offline' | 'permission_denied';

interface ScreenStateProps {
  kind: ScreenStateKind;
  title?: string;
  message?: string;
  queuedCount?: number;
  onRetry?: () => void;
}

/**
 * Standard states for every MedPulse data screen (Section 11.5).
 */
export function ScreenState({
  kind,
  title,
  message,
  queuedCount = 0,
  onRetry,
}: ScreenStateProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (kind === 'loading') {
    return (
      <View style={styles.centerContainer} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.message, { color: colors.textSecondary, marginTop: space(1.5) }]}>
          {message ?? t('states.loading')}
        </Text>
      </View>
    );
  }

  if (kind === 'offline') {
    return (
      <View
        style={[
          styles.banner,
          { backgroundColor: colors.warning, borderColor: colors.border },
        ]}
        accessible
        accessibilityRole="alert"
      >
        <MaterialCommunityIcons name="cloud-off-outline" size={20} color={colors.onWarning} />
        <View style={styles.bannerTextWrap}>
          <Text style={[styles.bannerTitle, { color: colors.onWarning }]}>
            {title ?? t('states.offlineBanner')}
          </Text>
          <Text style={[styles.bannerDetail, { color: colors.onWarning }]}>
            {message ?? t('states.offlineDetail', { count: queuedCount })}
          </Text>
        </View>
      </View>
    );
  }

  const config = {
    empty: {
      icon: 'inbox-outline' as const,
      color: colors.textSecondary,
      defaultTitle: t('states.emptyTitle'),
      defaultMessage: t('states.emptyMessage'),
    },
    error: {
      icon: 'alert-circle-outline' as const,
      color: colors.critical,
      defaultTitle: t('states.errorTitle'),
      defaultMessage: t('states.errorRetry'),
    },
    permission_denied: {
      icon: 'shield-lock-outline' as const,
      color: colors.critical,
      defaultTitle: t('states.permissionDeniedTitle'),
      defaultMessage: t('states.permissionDeniedMessage'),
    },
  }[kind];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MaterialCommunityIcons name={config.icon} size={36} color={config.color} />
      <Text style={[styles.title, { color: colors.text }]}>{title ?? config.defaultTitle}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        {message ?? config.defaultMessage}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={t('states.errorRetry')}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: pressed ? colors.critical : colors.primary },
          ]}
        >
          <Text style={[styles.retryLabel, { color: colors.onPrimary }]}>
            {t('states.errorRetry')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(3),
  },
  card: {
    alignItems: 'center',
    padding: space(3),
    borderRadius: radius.card,
    borderWidth: 1,
    gap: space(1),
  },
  title: {
    fontSize: type.h3,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: type.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  retryButton: {
    marginTop: space(1),
    minHeight: touchTarget.min,
    paddingHorizontal: space(3),
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryLabel: {
    fontSize: type.body,
    fontWeight: '600',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space(1.5),
    borderRadius: radius.button,
    borderWidth: 1,
    gap: space(1.5),
  },
  bannerTextWrap: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: type.small,
    fontWeight: '700',
  },
  bannerDetail: {
    fontSize: type.small,
  },
});
