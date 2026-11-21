import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenState } from '@/components/ScreenState';
import { StatusChip } from '@/components/StatusChip';
import { StockBar } from '@/components/StockBar';
import { useAuth } from '@/features/auth/AuthProvider';
import { sortBatchesFefo } from '@/features/inventory/fefo';
import {
  useItemDetail,
  useOfflineQueue,
  useRecentMovements,
} from '@/features/inventory/useInventory';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export default function ItemDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, locations } = useAuth();

  const [groupBy, setGroupBy] = useState<'location' | 'batch'>('location');
  const { item, snapshot, isOffline, isLoading, isError, refetch } = useItemDetail(itemId);
  const queueQuery = useOfflineQueue();
  const movementsQuery = useRecentMovements(itemId);

  const canRecordMovements = profile
    ? ['admin', 'store_manager', 'pharmacist', 'nurse'].includes(profile.role)
    : false;

  if (isLoading) {
    return <ScreenState kind="loading" />;
  }

  if (isError) {
    return <ScreenState kind="error" onRetry={() => void refetch()} />;
  }

  if (!item) {
    return <ScreenState kind="empty" />;
  }

  const pendingCount = (queueQuery.data ?? []).filter((q) => q.status === 'pending').length;
  const failedCount = (queueQuery.data ?? []).filter((q) => q.status === 'failed').length;

  const conditionTotals = Object.values(item.byLocation).reduce(
    (acc, loc) => ({
      usable: acc.usable + loc.usable,
      damaged: acc.damaged + loc.damaged,
      expired: acc.expired + loc.expired,
      quarantined: acc.quarantined + loc.quarantined,
    }),
    { usable: 0, damaged: 0, expired: 0, quarantined: 0 },
  );

  const sortedBatches = [
    ...sortBatchesFefo(item.batchStocks),
    ...item.batchStocks.filter((b) => b.condition !== 'usable' || !sortBatchesFefo([b]).length),
  ];

  const locationEntries = locations
    .map((loc) => ({ loc, stats: item.byLocation[loc.id] }))
    .filter((entry) => Boolean(entry.stats));

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <OfflineBanner
        isOffline={isOffline}
        lastSyncedAt={snapshot?.lastSyncedAt ?? ''}
        pendingCount={pendingCount}
        failedCount={failedCount}
        onSyncNow={() => void queueQuery.syncAll()}
      />

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {item.sku} · {item.categoryName} · {t('inventory.criticality', { level: item.criticality })}
        </Text>
        <View style={styles.chipRow}>
          {item.isControlled ? <StatusChip variant="critical" label={t('inventory.controlled')} /> : null}
          {item.isColdChain ? <StatusChip variant="healthy" label={t('inventory.coldChain')} /> : null}
        </View>
        {item.supplierName ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {t('inventory.supplierLabel')}: {item.supplierName}
          </Text>
        ) : null}
        {item.barcode ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {t('inventory.barcodeLabel')}: {item.barcode}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {t('inventory.unitCostLabel')}: {item.unitCost.toFixed(2)} / {item.baseUnit}
        </Text>
      </View>

      {canRecordMovements ? (
        <View style={styles.actionRow}>
          {(['receive', 'issue', 'transfer'] as const).map((movType) => (
            <Pressable
              key={movType}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/inventory/movement',
                  params: { type: movType, itemId: item.id },
                })
              }
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: pressed ? colors.critical : colors.primary },
              ]}
            >
              <Text style={[styles.actionText, { color: colors.onPrimary }]}>
                {t(`movement.types.${movType}`)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Stock separated by condition (MP-INV-006) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('inventory.conditionsTitle')}
        </Text>
        <View style={styles.conditionGrid}>
          {(['usable', 'damaged', 'expired', 'quarantined'] as const).map((cond) => (
            <View
              key={cond}
              style={[styles.condBox, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
            >
              <Text style={[styles.condValue, { color: colors.text }]}>
                {conditionTotals[cond]}
              </Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {t(`inventory.conditions.${cond}`)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Group by Location vs By Batch (MP-INV-003) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.toggleRow}>
          {(['location', 'batch'] as const).map((modeKey) => {
            const active = groupBy === modeKey;
            return (
              <Pressable
                key={modeKey}
                onPress={() => setGroupBy(modeKey)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[
                  styles.toggleBtn,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceSoft,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.toggleText, { color: active ? colors.onPrimary : colors.text }]}>
                  {modeKey === 'location' ? t('inventory.groupByLocation') : t('inventory.groupByBatch')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {groupBy === 'location' ? (
          locationEntries.map(({ loc, stats }) => (
            <View key={loc.id} style={[styles.subRow, { borderColor: colors.border }]}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{loc.name}</Text>
              <StockBar
                usable={stats.usable}
                minQty={stats.minQty}
                parQty={stats.parQty}
                maxQty={stats.maxQty}
                unit={item.baseUnit}
              />
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {t('inventory.availableReserved', {
                  available: stats.available,
                  reserved: stats.reserved,
                })}
                {stats.parQty !== null
                  ? ` · ${t('inventory.minParMax', {
                      min: stats.minQty ?? 0,
                      par: stats.parQty,
                      max: stats.maxQty ?? stats.parQty,
                    })}`
                  : ''}
              </Text>
            </View>
          ))
        ) : (
          sortedBatches.map((batch, index) => (
            <View
              key={`${batch.locationId}-${batch.batchId ?? 'none'}-${batch.condition}-${index}`}
              style={[styles.subRow, { borderColor: colors.border }]}
            >
              <View style={styles.batchHeader}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {batch.batchNo} · {batch.locationName}
                </Text>
                <StatusChip
                  variant={batch.condition === 'usable' ? 'healthy' : 'critical'}
                  label={t(`inventory.conditions.${batch.condition}`)}
                />
              </View>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {batch.qty} {item.baseUnit}
                {batch.expiryDate ? ` · ${t('inventory.expiresOn', { date: batch.expiryDate })}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Units of Measure */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('inventory.uomTitle')}</Text>
        {item.units.map((u) => (
          <Text key={u.unit} style={[styles.meta, { color: colors.text }]}>
            1 {u.unit} = {u.factorToBase} {item.baseUnit}
          </Text>
        ))}
      </View>

      {/* Recent movements */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {t('inventory.recentMovements')}
        </Text>
        {(movementsQuery.data ?? []).length === 0 ? (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {t('inventory.noMovements')}
          </Text>
        ) : (
          (movementsQuery.data ?? []).map((mov) => (
            <View key={mov.id} style={[styles.subRow, { borderColor: colors.border }]}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                {mov.qty} {item.baseUnit} · {mov.type}
              </Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {mov.fromLocationName ?? ''}
                {mov.fromLocationName && mov.toLocationName ? ' -> ' : ''}
                {mov.toLocationName ?? ''}
              </Text>
            </View>
          ))
        )}
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
    gap: space(2),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1),
  },
  title: {
    fontSize: type.h2,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  meta: {
    fontSize: type.small,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  actionRow: {
    flexDirection: 'row',
    gap: space(1),
  },
  actionButton: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1),
  },
  actionText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  conditionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  condBox: {
    flex: 1,
    minWidth: 120,
    borderRadius: radius.button,
    borderWidth: 1,
    padding: space(1.5),
    alignItems: 'center',
  },
  condValue: {
    fontSize: type.h2,
    fontWeight: '800',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: space(1),
  },
  toggleBtn: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  subRow: {
    borderTopWidth: 1,
    paddingTop: space(1),
    gap: space(0.5),
  },
  batchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space(1),
  },
  rowTitle: {
    fontSize: type.body,
    fontWeight: '600',
  },
});
