import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenState } from '@/components/ScreenState';
import { StatusChip } from '@/components/StatusChip';
import { StockBar } from '@/components/StockBar';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useCountSessionStore,
  type CountMode,
  type CountType,
} from '@/features/counting/countSessionStore';
import { filterInventoryItems, getItemStatusAtLocation } from '@/features/inventory/search';
import type {
  InventoryItemSummary,
  InventoryStatusFilter,
  ManualMovementType,
} from '@/features/inventory/types';
import {
  useInventoryCatalog,
  useOfflineQueue,
  useRecentMovements,
} from '@/features/inventory/useInventory';
import { useFeatureFlag } from '@/lib/flags';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

type SegmentKey = 'items' | 'counts' | 'movements';

const STATUS_FILTERS: InventoryStatusFilter[] = ['all', 'low', 'out', 'expiring', 'healthy'];
const MOVEMENT_ACTIONS: { type: ManualMovementType; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { type: 'receive', icon: 'package-down' },
  { type: 'issue', icon: 'package-up' },
  { type: 'transfer', icon: 'swap-horizontal' },
  { type: 'wastage', icon: 'delete-alert-outline' },
  { type: 'adjustment', icon: 'tune-variant' },
];

export default function InventoryScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, activeLocationId, locations } = useAuth();
  const scannerBetaOn = useFeatureFlag('scanner_beta', profile?.hospital_id, profile?.id);

  const [segment, setSegment] = useState<SegmentKey>('items');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<InventoryStatusFilter>('all');
  const [scopeLocationOnly, setScopeLocationOnly] = useState(false);

  const [countType, setCountType] = useState<CountType>('par');
  const [countMode, setCountMode] = useState<CountMode>('blind');
  const [countLocationId, setCountLocationId] = useState<string>(
    activeLocationId ?? locations[0]?.id ?? '',
  );
  const countSessions = useCountSessionStore((s) => s.sessions);

  const catalogQuery = useInventoryCatalog();
  const queueQuery = useOfflineQueue();
  const movementsQuery = useRecentMovements();

  const catalogErrorMessage =
    __DEV__ &&
    catalogQuery.error &&
    typeof catalogQuery.error === 'object' &&
    'message' in catalogQuery.error &&
    typeof catalogQuery.error.message === 'string'
      ? catalogQuery.error.message
      : undefined;

  const snapshot = catalogQuery.data?.snapshot ?? null;
  const isOffline = catalogQuery.data?.isOffline ?? false;
  const queuedItems = queueQuery.data ?? [];
  const pendingCount = queuedItems.filter((q) => q.status === 'pending').length;
  const failedItems = queuedItems.filter((q) => q.status === 'failed');

  const canRecordMovements = profile
    ? ['admin', 'store_manager', 'pharmacist', 'nurse'].includes(profile.role)
    : false;

  const selectedLocationId = scopeLocationOnly ? activeLocationId : null;
  const activeLocationName =
    locations.find((loc) => loc.id === activeLocationId)?.name ?? t('inventory.allLocations');

  const filteredItems = useMemo(() => {
    if (!snapshot) return [];
    return filterInventoryItems(snapshot.items, {
      query,
      categoryId,
      locationId: selectedLocationId,
      status: statusFilter,
    });
  }, [categoryId, query, selectedLocationId, snapshot, statusFilter]);

  const renderItemCard = ({ item }: { item: InventoryItemSummary }) => {
    const locStats = selectedLocationId ? item.byLocation[selectedLocationId] : undefined;
    const usable = locStats ? locStats.usable : item.totalUsable;
    const minQty = locStats ? locStats.minQty : item.totalMin || null;
    const parQty = locStats ? locStats.parQty : item.totalPar || null;
    const maxQty = locStats ? locStats.maxQty : item.totalMax || null;
    const effectiveStatus = getItemStatusAtLocation(item, selectedLocationId);

    return (
      <Pressable
        onPress={() => router.push(`/(tabs)/inventory/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.sku}`}
        style={({ pressed }) => [
          styles.itemCard,
          {
            backgroundColor: pressed ? colors.surfaceSoft : colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleCol}>
            <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
              {item.sku} · {item.categoryName} · {t('inventory.criticality', { level: item.criticality })}
            </Text>
          </View>
          {effectiveStatus === 'out' ? (
            <StatusChip variant="critical" label={t('inventory.filters.out')} />
          ) : effectiveStatus === 'low' ? (
            <StatusChip variant="warning" label={t('inventory.filters.low')} />
          ) : effectiveStatus === 'expiring' ? (
            <StatusChip
              variant="warning"
              label={
                item.earliestExpiry
                  ? t('inventory.expiresOn', { date: item.earliestExpiry })
                  : t('inventory.filters.expiring')
              }
            />
          ) : (
            <StatusChip variant="healthy" label={t('status.healthy')} />
          )}
        </View>

        <StockBar
          usable={usable}
          minQty={minQty}
          parQty={parQty}
          maxQty={maxQty}
          unit={item.baseUnit}
        />

        {item.earliestExpiry || item.isControlled || item.isColdChain ? (
          <View style={styles.badgeRow}>
            {item.earliestExpiry ? (
              <Text style={[styles.subBadge, { color: colors.textSecondary }]}>
                {t('inventory.expiresOn', { date: item.earliestExpiry })}
              </Text>
            ) : null}
            {item.isControlled ? (
              <StatusChip variant="critical" label={t('inventory.controlled')} />
            ) : null}
            {item.isColdChain ? (
              <StatusChip variant="healthy" label={t('inventory.coldChain')} />
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.topHeader}>
          <Text style={[styles.heading, { color: colors.text }]}>{t('inventory.title')}</Text>
          {scannerBetaOn ? <StatusChip variant="in_testing" /> : null}
        </View>

        <OfflineBanner
          isOffline={isOffline}
          lastSyncedAt={snapshot?.lastSyncedAt ?? ''}
          pendingCount={pendingCount}
          failedCount={failedItems.length}
          onSyncNow={() => void queueQuery.syncAll()}
        />

        {/* Segmented control: Items | Counts | Movements */}
        <View style={[styles.segmentBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['items', 'counts', 'movements'] as SegmentKey[]).map((key) => {
            const active = segment === key;
            return (
              <Pressable
                key={key}
                testID={`inventory-segment-${key}`}
                onPress={() => setSegment(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[
                  styles.segmentButton,
                  { backgroundColor: active ? colors.primary : 'transparent' },
                ]}
              >
                <Text
                  style={[
                    styles.segmentLabel,
                    { color: active ? colors.onPrimary : colors.text },
                  ]}
                >
                  {t(`inventory.segments.${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {segment === 'items' ? (
          <View style={styles.flex}>
            <TextInput
              testID="inventory-search-input"
              value={query}
              onChangeText={setQuery}
              placeholder={t('inventory.searchPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel={t('inventory.searchPlaceholder')}
              style={[
                styles.searchInput,
                {
                  color: colors.text,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={styles.filterScroll}
            >
              {activeLocationId ? (
                <Pressable
                  onPress={() => setScopeLocationOnly((prev) => !prev)}
                  accessibilityRole="button"
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: scopeLocationOnly ? colors.primary : colors.card,
                      borderColor: scopeLocationOnly ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: scopeLocationOnly ? colors.onPrimary : colors.text },
                    ]}
                  >
                    {scopeLocationOnly ? activeLocationName : t('inventory.allLocations')}
                  </Text>
                </Pressable>
              ) : null}

              {STATUS_FILTERS.map((st) => {
                const active = statusFilter === st;
                return (
                  <Pressable
                    key={st}
                    testID={`inventory-filter-${st}`}
                    onPress={() => setStatusFilter(st)}
                    accessibilityRole="button"
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.primary : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? colors.onPrimary : colors.text },
                      ]}
                    >
                      {t(`inventory.filters.${st}`)}
                    </Text>
                  </Pressable>
                );
              })}

              {(snapshot?.categories ?? []).map((cat) => {
                const active = categoryId === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategoryId((prev) => (prev === cat.id ? null : cat.id))}
                    accessibilityRole="button"
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.healthy : colors.card,
                        borderColor: active ? colors.healthy : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        { color: active ? colors.onHealthy : colors.text },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {catalogQuery.isLoading ? (
              <ScreenState kind="loading" />
            ) : catalogQuery.isError ? (
              <ScreenState
                kind="error"
                message={catalogErrorMessage}
                onRetry={() => void catalogQuery.refetch()}
              />
            ) : filteredItems.length === 0 ? (
              <ScreenState
                kind="empty"
                title={t('states.emptyTitle')}
                message={t('inventory.emptyCatalog')}
              />
            ) : (
              <FlatList
                data={filteredItems}
                keyExtractor={(item) => item.id}
                renderItem={renderItemCard}
                contentContainerStyle={styles.listContent}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={7}
              />
            )}
          </View>
        ) : segment === 'counts' ? (
          <ScrollView contentContainerStyle={styles.movementsScroll}>
            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('counting.screenTitle')}
              </Text>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {t('counting.hubSubtitle')}
              </Text>

              <Text style={[styles.queueTitle, { color: colors.text }]}>
                {t('counting.locationLabel')}
              </Text>
              <View style={styles.actionGrid}>
                {locations.map((loc) => {
                  const activeLoc = (countLocationId || activeLocationId || locations[0]?.id) === loc.id;
                  return (
                    <Pressable
                      key={loc.id}
                      onPress={() => setCountLocationId(loc.id)}
                      accessibilityRole="button"
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: activeLoc ? colors.primary : colors.surfaceSoft,
                          borderColor: activeLoc ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: activeLoc ? colors.onPrimary : colors.text },
                        ]}
                      >
                        {loc.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.queueTitle, { color: colors.text }]}>
                {t('counting.typeLabel')}
              </Text>
              <View style={styles.actionGrid}>
                {(['par', 'cycle', 'spot'] as CountType[]).map((ct) => {
                  const selected = countType === ct;
                  return (
                    <Pressable
                      key={ct}
                      onPress={() => setCountType(ct)}
                      accessibilityRole="button"
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: selected ? colors.primary : colors.surfaceSoft,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: selected ? colors.onPrimary : colors.text },
                        ]}
                      >
                        {t(`counting.types.${ct}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.queueTitle, { color: colors.text }]}>
                {t('counting.modeLabel')}
              </Text>
              <View style={styles.actionGrid}>
                {(['blind', 'visible'] as CountMode[]).map((cm) => {
                  const selected = countMode === cm;
                  return (
                    <Pressable
                      key={cm}
                      onPress={() => setCountMode(cm)}
                      accessibilityRole="button"
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: selected ? colors.healthy : colors.surfaceSoft,
                          borderColor: selected ? colors.healthy : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: selected ? colors.onHealthy : colors.text },
                        ]}
                      >
                        {t(`counting.modes.${cm}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {countMode === 'blind' ? t('counting.blindHint') : t('counting.visibleHint')}
              </Text>

              <Pressable
                testID="counts-start-session-btn"
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/inventory/count',
                    params: {
                      locationId: countLocationId || activeLocationId || locations[0]?.id || '',
                      type: countType,
                      mode: countMode,
                    },
                  })
                }
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: pressed ? colors.critical : colors.primary,
                    justifyContent: 'center',
                  },
                ]}
              >
                <MaterialCommunityIcons name="counter" size={20} color={colors.onPrimary} />
                <Text style={[styles.actionLabel, { color: colors.onPrimary }]}>
                  {t('counting.startSession')}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('counting.recentSessions')}
              </Text>
              {countSessions.length === 0 ? (
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {t('counting.noRecentSessions')}
                </Text>
              ) : (
                countSessions.map((sess) => (
                  <View key={sess.id} style={[styles.movRow, { borderColor: colors.border }]}>
                    <Text style={[styles.queueTitle, { color: colors.text }]}>
                      {sess.locationName} · {t(`counting.types.${sess.type}`)} ·{' '}
                      {t(`counting.modes.${sess.mode}`)}
                    </Text>
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {t('counting.sessionAccuracy', {
                        accuracy: sess.accuracyPct.toFixed(0),
                        counted: sess.countedCount,
                        posted: sess.postedCount,
                      })}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.movementsScroll}>
            {canRecordMovements ? (
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {t('inventory.quickActions')}
                </Text>
                <View style={styles.actionGrid}>
                  {MOVEMENT_ACTIONS.map((action) => (
                    <Pressable
                      key={action.type}
                      testID={`movement-action-${action.type}`}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/inventory/movement',
                          params: { type: action.type },
                        })
                      }
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.actionButton,
                        {
                          backgroundColor: pressed ? colors.critical : colors.primary,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons name={action.icon} size={20} color={colors.onPrimary} />
                      <Text style={[styles.actionLabel, { color: colors.onPrimary }]}>
                        {t(`movement.types.${action.type}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <ScreenState kind="permission_denied" />
            )}

            {failedItems.length > 0 ? (
              <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.critical }]}>
                <Text style={[styles.sectionTitle, { color: colors.critical }]}>
                  {t('inventory.needsAttentionTitle')}
                </Text>
                {failedItems.map((entry) => (
                  <View key={entry.id} style={[styles.queueRow, { borderColor: colors.border }]}>
                    <Text style={[styles.queueTitle, { color: colors.text }]}>
                      {entry.itemName ?? entry.payload.itemId} · {t(`movement.types.${entry.payload.type}`)}
                    </Text>
                    <Text style={[styles.queueError, { color: colors.critical }]}>
                      {entry.errorMessage}
                    </Text>
                    <View style={styles.queueActions}>
                      <Pressable
                        onPress={() => void queueQuery.retryItem(entry.id)}
                        accessibilityRole="button"
                        style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                      >
                        <Text style={[styles.smallBtnText, { color: colors.onPrimary }]}>
                          {t('inventory.retry')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void queueQuery.discardItem(entry.id)}
                        accessibilityRole="button"
                        style={[styles.smallBtn, { backgroundColor: colors.warning }]}
                      >
                        <Text style={[styles.smallBtnText, { color: colors.onWarning }]}>
                          {t('inventory.discard')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {t('inventory.recentMovements')}
              </Text>
              {movementsQuery.isLoading ? (
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {t('states.loading')}
                </Text>
              ) : (movementsQuery.data ?? []).length === 0 ? (
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {t('inventory.noMovements')}
                </Text>
              ) : (
                (movementsQuery.data ?? []).map((mov) => (
                  <View key={mov.id} style={[styles.movRow, { borderColor: colors.border }]}>
                    <Text style={[styles.queueTitle, { color: colors.text }]}>
                      {mov.itemName} · {mov.qty} {mov.baseUnit}
                    </Text>
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {t(`movement.types.${mov.type === 'count_adjustment' || mov.type === 'return' ? 'adjustment' : mov.type}`)}
                      {mov.fromLocationName ? ` · ${mov.fromLocationName}` : ''}
                      {mov.toLocationName ? ` -> ${mov.toLocationName}` : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </View>
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
  container: {
    flex: 1,
    paddingHorizontal: space(2),
    paddingTop: space(1),
    gap: space(1.5),
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  segmentBar: {
    flexDirection: 'row',
    borderRadius: radius.button,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button - 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: type.small,
    fontWeight: '700',
  },
  searchInput: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    fontSize: type.body,
  },
  filterScroll: {
    flexGrow: 0,
    marginVertical: space(1),
  },
  filterRow: {
    gap: space(1),
    paddingRight: space(2),
  },
  filterChip: {
    minHeight: touchTarget.min,
    paddingHorizontal: space(1.5),
    borderRadius: radius.chip,
    borderWidth: 1,
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: space(3),
    gap: space(1.5),
  },
  itemCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1),
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space(1),
  },
  itemTitleCol: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: type.body,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: type.small,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(1),
  },
  subBadge: {
    fontSize: type.small,
    fontWeight: '600',
  },
  movementsScroll: {
    gap: space(2),
    paddingBottom: space(3),
  },
  sectionCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1.5),
  },
  sectionTitle: {
    fontSize: type.h3,
    fontWeight: '700',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  actionButton: {
    minHeight: touchTarget.min,
    paddingHorizontal: space(1.5),
    borderRadius: radius.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
  },
  actionLabel: {
    fontSize: type.small,
    fontWeight: '700',
  },
  queueRow: {
    borderTopWidth: 1,
    paddingTop: space(1),
    gap: space(0.5),
  },
  queueTitle: {
    fontSize: type.body,
    fontWeight: '600',
  },
  queueError: {
    fontSize: type.small,
    fontWeight: '600',
  },
  queueActions: {
    flexDirection: 'row',
    gap: space(1),
    marginTop: space(0.5),
  },
  smallBtn: {
    minHeight: touchTarget.min,
    paddingHorizontal: space(2),
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  movRow: {
    borderTopWidth: 1,
    paddingTop: space(1),
    gap: 2,
  },
  metaText: {
    fontSize: type.small,
  },
});
