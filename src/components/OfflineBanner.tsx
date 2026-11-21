import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';
import { StatusChip } from './StatusChip';

interface OfflineBannerProps {
  isOffline: boolean;
  lastSyncedAt: string;
  pendingCount: number;
  failedCount: number;
  onSyncNow?: () => void;
}

function formatSyncedTime(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Displays offline connectivity banner, "Last synced <time>", queued movement count,
 * and failed ("Needs attention") status (MP-INV-011, MP-MOV-008, Section 11.4).
 */
export function OfflineBanner({
  isOffline,
  lastSyncedAt,
  pendingCount,
  failedCount,
  onSyncNow,
}: OfflineBannerProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  if (!isOffline && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  const syncedTime = formatSyncedTime(lastSyncedAt);
  const syncedLabel = syncedTime
    ? t('inventory.lastSynced', { time: syncedTime })
    : t('inventory.notSyncedYet');

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isOffline ? colors.warning : colors.card,
          borderColor: colors.border,
        },
      ]}
      accessible
      accessibilityRole="alert"
      testID="offline-banner"
    >
      <View style={styles.topRow}>
        <MaterialCommunityIcons
          name={isOffline ? 'cloud-off-outline' : 'cloud-sync-outline'}
          size={20}
          color={isOffline ? colors.onWarning : colors.primary}
        />
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: isOffline ? colors.onWarning : colors.text }]}>
            {isOffline ? t('states.offlineBanner') : t('inventory.pendingQueueCount', { count: pendingCount })}
          </Text>
          <Text style={[styles.subtitle, { color: isOffline ? colors.onWarning : colors.textSecondary }]}>
            {syncedLabel}
            {isOffline && pendingCount > 0
              ? ` · ${t('inventory.pendingQueueCount', { count: pendingCount })}`
              : ''}
          </Text>
        </View>

        {!isOffline && pendingCount > 0 && onSyncNow ? (
          <Pressable
            onPress={onSyncNow}
            accessibilityRole="button"
            accessibilityLabel={t('inventory.syncNow')}
            style={[styles.syncBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.syncBtnText, { color: colors.onPrimary }]}>
              {t('inventory.syncNow')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {failedCount > 0 ? (
        <View style={styles.failedRow}>
          <StatusChip
            variant="critical"
            label={t('inventory.needsAttentionCount', { count: failedCount })}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.button,
    borderWidth: 1,
    padding: space(1.5),
    gap: space(1),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: type.small,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: type.small,
  },
  syncBtn: {
    minHeight: touchTarget.min,
    paddingHorizontal: space(1.5),
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  failedRow: {
    flexDirection: 'row',
  },
});
