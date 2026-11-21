import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Counter } from '@/components/Counter';
import { ScreenState } from '@/components/ScreenState';
import { StatusChip } from '@/components/StatusChip';
import { VarianceChip } from '@/components/VarianceChip';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  canSubmitCountLine,
  computeLineVariance,
  computeWhatsNeeded,
  defaultToleranceForItem,
  requiresWitnessForItem,
  type WhatsNeededLine,
} from '@/features/counting/countingLogic';
import {
  useCountSessionStore,
  type CountMode,
  type CountType,
} from '@/features/counting/countSessionStore';
import type { InventoryItemSummary } from '@/features/inventory/types';
import { useInventoryCatalog, useSubmitMovement } from '@/features/inventory/useInventory';
import { generateMovementId } from '@/lib/offlineQueue';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

interface LineDraft {
  countValue: number;
  unit: string;
  damaged: number;
  expired: number;
  quarantined: number;
  skipped: boolean;
  touched: boolean;
  witnessConfirmed: boolean;
  note: string;
}

interface UndoEntry {
  itemId: string;
  prev: LineDraft;
}

export default function CountSessionScreen() {
  const params = useLocalSearchParams<{ locationId?: string; mode?: string; type?: string }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, locations, activeLocationId } = useAuth();
  const catalogQuery = useInventoryCatalog();
  const submitMovementMutation = useSubmitMovement();
  const addSession = useCountSessionStore((s) => s.addSession);

  const snapshot = catalogQuery.data?.snapshot ?? null;
  const locationId = params.locationId ?? activeLocationId ?? locations[0]?.id ?? '';
  const locationName =
    locations.find((loc) => loc.id === locationId)?.name ?? t('inventory.allLocations');
  const countMode: CountMode = params.mode === 'visible' ? 'visible' : 'blind';
  const countType: CountType =
    params.type === 'cycle' || params.type === 'spot' ? params.type : 'par';

  const countItems = useMemo<InventoryItemSummary[]>(() => {
    if (!snapshot) return [];
    const atLocation = snapshot.items.filter((item) => {
      const stats = item.byLocation[locationId];
      return Boolean(stats && ((stats.parQty ?? 0) > 0 || stats.usable > 0));
    });
    const list = atLocation.length > 0 ? atLocation : snapshot.items;
    return list.slice(0, countType === 'spot' ? 3 : 10);
  }, [countType, locationId, snapshot]);

  const [step, setStep] = useState<'count' | 'review' | 'whats_needed'>('count');
  const [cursor, setCursor] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [reasonCode, setReasonCode] = useState<string>('miscount');
  const [reviewNote, setReviewNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [whatsNeededLines, setWhatsNeededLines] = useState<WhatsNeededLine[]>([]);

  const centralStoreId = useMemo(
    () => locations.find((l) => l.type === 'central_store')?.id ?? locations[0]?.id ?? '',
    [locations],
  );

  const getDraft = (item: InventoryItemSummary): LineDraft => {
    const existing = drafts[item.id];
    if (existing) return existing;
    return {
      countValue: 0,
      unit: item.baseUnit,
      damaged: 0,
      expired: 0,
      quarantined: 0,
      skipped: false,
      touched: false,
      witnessConfirmed: false,
      note: '',
    };
  };

  const updateDraft = (item: InventoryItemSummary, patch: Partial<LineDraft>) => {
    const prev = getDraft(item);
    setUndoStack((stack) => [...stack.slice(-24), { itemId: item.id, prev }]);
    setDrafts((curr) => ({
      ...curr,
      [item.id]: {
        ...prev,
        ...patch,
      },
    }));
  };

  const handleUndo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setDrafts((curr) => ({
      ...curr,
      [last.itemId]: last.prev,
    }));
  };

  if (catalogQuery.isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenState kind="loading" />
      </SafeAreaView>
    );
  }

  if (!snapshot || countItems.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScreenState kind="empty" message={t('inventory.emptyCatalog')} />
      </SafeAreaView>
    );
  }

  const safeIndex = Math.min(cursor, countItems.length - 1);
  const currentItem = countItems[safeIndex];
  const currentDraft = getDraft(currentItem);
  const activeUnit =
    currentItem.units.find((u) => u.unit === currentDraft.unit) ??
    currentItem.units[0] ?? {
      itemId: currentItem.id,
      unit: currentItem.baseUnit,
      factorToBase: 1,
      isOrderPack: true,
    };

  const countedBaseCurrent = currentDraft.countValue * activeUnit.factorToBase;
  const currentLocStats = currentItem.byLocation[locationId];
  const currentSystemQty = currentLocStats?.usable ?? 0;
  const currentTolerance = defaultToleranceForItem(currentItem);
  const currentVariance = computeLineVariance(
    countedBaseCurrent,
    currentSystemQty,
    currentTolerance,
    currentItem.unitCost,
  );
  const needsWitnessCurrent = requiresWitnessForItem(currentItem);

  const reviewRows = countItems.map((item) => {
    const d = getDraft(item);
    const u = item.units.find((unit) => unit.unit === d.unit) ?? item.units[0];
    const factor = u?.factorToBase ?? 1;
    const countedGood = d.countValue * factor;
    const locStats = item.byLocation[locationId];
    const systemQty = locStats?.usable ?? 0;
    const parQty = locStats?.parQty ?? item.totalPar;
    const minQty = locStats?.minQty ?? item.totalMin;
    const maxQty = locStats?.maxQty ?? item.totalMax;
    const tolerance = defaultToleranceForItem(item);
    const variance = computeLineVariance(countedGood, systemQty, tolerance, item.unitCost);
    const unusableRemoved = d.damaged + d.expired + d.quarantined;

    return {
      item,
      draft: d,
      countedGood,
      systemQty,
      parQty,
      minQty,
      maxQty,
      tolerance,
      variance,
      unusableRemoved,
    };
  });

  const nonZeroRows = reviewRows.filter((r) => !r.draft.skipped && r.variance.varianceQty !== 0);
  const countedTotal = reviewRows.filter((r) => !r.draft.skipped).length;
  const skippedTotal = reviewRows.filter((r) => r.draft.skipped).length;

  const canPostToLedger = profile
    ? ['admin', 'store_manager', 'pharmacist'].includes(profile.role)
    : false;

  const handleApproveAndPost = async () => {
    setErrorMsg(null);

    // Witness check on counted controlled/blood lines (MP-CNT-019)
    const missingWitnessNames: string[] = [];
    for (const row of reviewRows) {
      if (row.draft.skipped) continue;
      const check = canSubmitCountLine(row.item, row.draft.witnessConfirmed);
      if (!check.ok) {
        missingWitnessNames.push(row.item.name);
      }
    }
    if (missingWitnessNames.length > 0) {
      setErrorMsg(
        t('counting.witnessMissingError', { items: missingWitnessNames.join(', ') }),
      );
      return;
    }

    if (nonZeroRows.length > 0 && !reasonCode) {
      setErrorMsg(t('counting.reasonRequiredError'));
      return;
    }

    const selectedReasonObj = snapshot.reasonCodes.find((r) => r.code === reasonCode);
    if (nonZeroRows.length > 0 && selectedReasonObj?.requiresNote && !reviewNote.trim()) {
      setErrorMsg(t('movement.errors.noteRequired'));
      return;
    }

    let postedCount = 0;
    if (canPostToLedger && nonZeroRows.length > 0) {
      try {
        for (const row of nonZeroRows) {
          const delta = row.variance.varianceQty;
          const locBatches = row.item.batchStocks.filter(
            (b) => b.locationId === locationId && b.condition === 'usable' && b.qty > 0,
          );
          const matchingBatchId = row.item.tracksBatch
            ? (locBatches[0]?.batchId ?? row.item.batchStocks[0]?.batchId ?? null)
            : null;

          // If decreasing stock via ledger exceeds single batch qty, clamp or use matching batch
          const decreaseCap = locBatches[0]?.availableQty ?? row.systemQty;
          const postQty = delta < 0 ? Math.min(Math.abs(delta), Math.max(decreaseCap, 0)) : delta;

          if (postQty > 0) {
            await submitMovementMutation.mutateAsync({
              draft: {
                itemId: row.item.id,
                type: 'count_adjustment',
                qtyBase: postQty,
                condition: 'usable',
                fromLocationId: delta < 0 ? locationId : null,
                toLocationId: delta > 0 ? locationId : null,
                batchId: matchingBatchId,
                batchNo: null,
                expiryDate: null,
                reasonCode,
                note: reviewNote.trim() || `${countType.toUpperCase()} count variance adjustment`,
              },
              itemName: row.item.name,
              unitSummary: `${postQty} ${row.item.baseUnit}`,
            });
            postedCount += 1;
          }
        }
      } catch {
        setErrorMsg(t('counting.postFailed'));
        return;
      }
    }

    const neededComputed = computeWhatsNeeded(
      reviewRows.map((row) => ({
        itemId: row.item.id,
        sku: row.item.sku,
        name: row.item.name,
        baseUnit: row.item.baseUnit,
        parQty: row.parQty,
        minQty: row.minQty,
        maxQty: row.maxQty,
        countedGood: row.countedGood,
        unusableRemoved: row.unusableRemoved,
        daysToExpiry: row.item.daysToExpiry,
        units: row.item.units,
      })),
    );

    const matchCount = Math.max(countedTotal - nonZeroRows.length, 0);
    const accuracyPct = countedTotal > 0 ? (matchCount / countedTotal) * 100 : 100;

    addSession({
      id: generateMovementId(),
      locationId,
      locationName,
      type: countType,
      mode: countMode,
      countedCount: countedTotal,
      skippedCount: skippedTotal,
      varianceCount: nonZeroRows.length,
      postedCount,
      accuracyPct,
      completedAt: new Date().toISOString(),
      whatsNeeded: neededComputed,
    });

    setWhatsNeededLines(neededComputed);
    setStep('whats_needed');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      {step === 'count' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Progress header */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.progressHeader}>
              <Text style={[styles.locTitle, { color: colors.text }]}>
                {locationName} · {t(`counting.types.${countType}`)}
              </Text>
              <Text style={[styles.progressText, { color: colors.primary }]}>
                {t('counting.progress', { current: safeIndex + 1, total: countItems.length })}
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.primary,
                    width: `${((safeIndex + 1) / countItems.length) * 100}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Item + Mode Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.itemTopRow}>
              <View style={styles.flex}>
                <Text style={[styles.itemName, { color: colors.text }]}>{currentItem.name}</Text>
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {currentItem.sku} · {currentItem.categoryName} ·{' '}
                  {t('counting.toleranceBadge', { pct: currentTolerance })}
                </Text>
              </View>
              {currentDraft.skipped ? (
                <StatusChip variant="warning" label={t('counting.skipAction')} />
              ) : null}
            </View>

            {/* Blind vs Visible Mode enforcement (MP-CNT-003, MP-CNT-004) */}
            {countMode === 'blind' ? (
              <View style={[styles.modeBanner, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="eye-off-outline" size={18} color={colors.text} />
                <Text style={[styles.modeBannerText, { color: colors.text }]}>
                  {t('counting.blindBadge')}
                </Text>
              </View>
            ) : (
              <View style={styles.visibleInfoRow}>
                <Text style={[styles.visibleSystemText, { color: colors.textSecondary }]}>
                  {t('counting.visibleSystemQty', {
                    qty: currentSystemQty,
                    unit: currentItem.baseUnit,
                  })}
                </Text>
                <VarianceChip
                  varianceQty={currentVariance.varianceQty}
                  variancePct={currentVariance.variancePct}
                  outOfTolerance={currentVariance.outOfTolerance}
                />
              </View>
            )}

            {/* Unit Switcher (MP-CNT-006) */}
            <View style={styles.chipRow}>
              {currentItem.units.map((u) => {
                const selected = u.unit === activeUnit.unit;
                return (
                  <Pressable
                    key={u.unit}
                    onPress={() => updateDraft(currentItem, { unit: u.unit })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.unitChip,
                      {
                        backgroundColor: selected ? colors.primary : colors.surfaceSoft,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        { color: selected ? colors.onPrimary : colors.text },
                      ]}
                    >
                      {u.unit} (x{u.factorToBase})
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Glove-friendly Counter (MP-CNT-005) */}
            <Counter
              value={currentDraft.countValue}
              onChange={(nextVal) =>
                updateDraft(currentItem, {
                  countValue: nextVal,
                  touched: true,
                  skipped: false,
                })
              }
              label={currentItem.name}
              conversionText={
                activeUnit.factorToBase > 1
                  ? t('counting.unitConversion', {
                      count: currentDraft.countValue,
                      unit: activeUnit.unit,
                      baseQty: countedBaseCurrent,
                      baseUnit: currentItem.baseUnit,
                    })
                  : undefined
              }
            />

            {/* Condition split (MP-CNT-008) */}
            <Text style={[styles.subSectionLabel, { color: colors.text }]}>
              {t('counting.conditionsTitle')}
            </Text>
            <View style={styles.conditionRow}>
              {(
                [
                  { key: 'damaged', labelKey: 'counting.damagedShort' },
                  { key: 'expired', labelKey: 'counting.expiredShort' },
                  { key: 'quarantined', labelKey: 'counting.quarantinedShort' },
                ] as const
              ).map((cond) => {
                const qtyVal = currentDraft[cond.key];
                return (
                  <Pressable
                    key={cond.key}
                    onPress={() =>
                      updateDraft(currentItem, { [cond.key]: qtyVal + 1, touched: true })
                    }
                    onLongPress={() => updateDraft(currentItem, { [cond.key]: 0 })}
                    accessibilityRole="button"
                    style={[
                      styles.condChip,
                      {
                        backgroundColor: qtyVal > 0 ? colors.warning : colors.surfaceSoft,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.condChipText,
                        { color: qtyVal > 0 ? colors.onWarning : colors.text },
                      ]}
                    >
                      {t(cond.labelKey)}: {qtyVal} (+1)
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Witness requirement for controlled & blood lines (MP-CNT-019) */}
            {needsWitnessCurrent ? (
              <Pressable
                onPress={() =>
                  updateDraft(currentItem, {
                    witnessConfirmed: !currentDraft.witnessConfirmed,
                  })
                }
                accessibilityRole="button"
                accessibilityState={{ selected: currentDraft.witnessConfirmed }}
                style={[
                  styles.witnessBox,
                  {
                    backgroundColor: currentDraft.witnessConfirmed
                      ? colors.healthy
                      : colors.warning,
                    borderColor: colors.border,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    currentDraft.witnessConfirmed
                      ? 'account-check-outline'
                      : 'account-alert-outline'
                  }
                  size={20}
                  color={currentDraft.witnessConfirmed ? colors.onHealthy : colors.onWarning}
                />
                <View style={styles.flex}>
                  <Text
                    style={[
                      styles.witnessTitle,
                      {
                        color: currentDraft.witnessConfirmed
                          ? colors.onHealthy
                          : colors.onWarning,
                      },
                    ]}
                  >
                    {currentDraft.witnessConfirmed
                      ? t('counting.witnessConfirmed')
                      : t('counting.witnessRequiredTitle')}
                  </Text>
                  <Text
                    style={[
                      styles.witnessBody,
                      {
                        color: currentDraft.witnessConfirmed
                          ? colors.onHealthy
                          : colors.onWarning,
                      },
                    ]}
                  >
                    {currentDraft.witnessConfirmed
                      ? t('counting.witnessConfirmed')
                      : t('counting.witnessRequiredBody')}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {/* Note & Quick Utility Row */}
            <TextInput
              value={currentDraft.note}
              onChangeText={(txt) => updateDraft(currentItem, { note: txt })}
              placeholder={t('counting.notePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.noteInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
              ]}
            />

            <View style={styles.utilityRow}>
              <Pressable
                onPress={() =>
                  updateDraft(currentItem, {
                    countValue: 0,
                    touched: true,
                    skipped: false,
                  })
                }
                accessibilityRole="button"
                style={[styles.utilBtn, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
              >
                <Text style={[styles.utilBtnText, { color: colors.text }]}>
                  {t('counting.zeroAction')}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  updateDraft(currentItem, { skipped: true });
                  if (safeIndex < countItems.length - 1) setCursor(safeIndex + 1);
                }}
                accessibilityRole="button"
                style={[styles.utilBtn, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
              >
                <Text style={[styles.utilBtnText, { color: colors.text }]}>
                  {t('counting.skipAction')}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleUndo}
                disabled={undoStack.length === 0}
                accessibilityRole="button"
                style={[
                  styles.utilBtn,
                  {
                    backgroundColor: colors.surfaceSoft,
                    borderColor: colors.border,
                    opacity: undoStack.length === 0 ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={[styles.utilBtnText, { color: colors.text }]}>
                  {t('counting.undoAction')}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Prev / Next / Review Bar */}
          <View style={styles.navBar}>
            <Pressable
              onPress={() => setCursor((c) => Math.max(0, c - 1))}
              disabled={safeIndex === 0}
              accessibilityRole="button"
              style={[
                styles.navBtn,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: safeIndex === 0 ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.navBtnText, { color: colors.text }]}>
                {t('counting.prevAction')}
              </Text>
            </Pressable>

            {safeIndex < countItems.length - 1 ? (
              <Pressable
                onPress={() => setCursor((c) => Math.min(countItems.length - 1, c + 1))}
                accessibilityRole="button"
                style={[styles.navBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[styles.navBtnText, { color: colors.onPrimary }]}>
                  {t('counting.nextAction')}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="count-review-btn"
              onPress={() => {
                setErrorMsg(null);
                setStep('review');
              }}
              accessibilityRole="button"
              style={[styles.navBtn, { backgroundColor: colors.healthy, borderColor: colors.healthy }]}
            >
              <Text style={[styles.navBtnText, { color: colors.onHealthy }]}>
                {t('counting.reviewSubmit')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : step === 'review' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.itemName, { color: colors.text }]}>
              {t('counting.reviewTitle')}
            </Text>
            <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
              {t('counting.reviewSummary', {
                counted: countedTotal,
                skipped: skippedTotal,
                variances: nonZeroRows.length,
              })}
            </Text>
          </View>

          {errorMsg ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.critical }]}>
              <MaterialCommunityIcons name="alert-octagon-outline" size={20} color={colors.onCritical} />
              <Text style={[styles.errorText, { color: colors.onCritical }]}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {reviewRows.map((row) => (
              <View key={row.item.id} style={[styles.reviewRow, { borderColor: colors.border }]}>
                <View style={styles.flex}>
                  <Text style={[styles.reviewItemName, { color: colors.text }]}>
                    {row.item.name}
                  </Text>
                  <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                    {row.draft.skipped
                      ? t('counting.skipAction')
                      : `Counted ${row.countedGood} · System ${row.systemQty} ${row.item.baseUnit}`}
                  </Text>
                </View>
                {row.draft.skipped ? (
                  <StatusChip variant="warning" label={t('counting.skipAction')} />
                ) : (
                  <VarianceChip
                    varianceQty={row.variance.varianceQty}
                    variancePct={row.variance.variancePct}
                    outOfTolerance={row.variance.outOfTolerance}
                  />
                )}
              </View>
            ))}
          </View>

          {nonZeroRows.length > 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.subSectionLabel, { color: colors.text }]}>
                {t('counting.reasonCodeTitle')}
              </Text>
              <View style={styles.chipRow}>
                {snapshot.reasonCodes.slice(0, 6).map((rc) => {
                  const selected = reasonCode === rc.code;
                  return (
                    <Pressable
                      key={rc.code}
                      onPress={() => setReasonCode(rc.code)}
                      accessibilityRole="button"
                      style={[
                        styles.unitChip,
                        {
                          backgroundColor: selected ? colors.primary : colors.surfaceSoft,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.unitChipText,
                          { color: selected ? colors.onPrimary : colors.text },
                        ]}
                      >
                        {rc.labelEn}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={reviewNote}
                onChangeText={setReviewNote}
                placeholder={t('counting.notePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.noteInput,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                ]}
              />
            </View>
          ) : null}

          <View style={styles.navBar}>
            <Pressable
              onPress={() => setStep('count')}
              accessibilityRole="button"
              style={[styles.navBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.navBtnText, { color: colors.text }]}>
                {t('counting.editLines')}
              </Text>
            </Pressable>

            <Pressable
              testID="count-post-btn"
              onPress={() => void handleApproveAndPost()}
              disabled={submitMovementMutation.isPending}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.navBtn,
                {
                  backgroundColor: pressed ? colors.critical : colors.primary,
                  borderColor: colors.primary,
                  flex: 2,
                },
              ]}
            >
              <Text style={[styles.navBtnText, { color: colors.onPrimary }]}>
                {submitMovementMutation.isPending
                  ? t('counting.posting')
                  : t('counting.approveAndPost')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.itemName, { color: colors.text }]}>
              {t('counting.whatsNeededTitle')}
            </Text>
            <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
              {locationName} · {t(`counting.types.${countType}`)} · {t(`counting.modes.${countMode}`)}
            </Text>
          </View>

          {whatsNeededLines.map((line) => (
            <View
              key={line.itemId}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.itemTopRow}>
                <View style={styles.flex}>
                  <Text style={[styles.reviewItemName, { color: colors.text }]}>{line.name}</Text>
                  <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                    {t('counting.whatsNeededSubtitle', {
                      par: line.parQty,
                      counted: line.countedGood,
                      needed: line.needed,
                      order: line.suggestedOrder,
                      unit: line.baseUnit,
                    })}
                  </Text>
                </View>
                <StatusChip
                  variant={
                    line.flags.atOrBelowMin
                      ? 'critical'
                      : line.flags.belowPar
                        ? 'warning'
                        : 'healthy'
                  }
                  label={
                    line.flags.atOrBelowMin
                      ? t('counting.flagMin')
                      : line.flags.belowPar
                        ? t('counting.flagBelowPar')
                        : t('status.healthy')
                  }
                />
              </View>

              {line.needed > 0 && centralStoreId && centralStoreId !== locationId ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/inventory/movement',
                      params: {
                        type: 'transfer',
                        itemId: line.itemId,
                        fromLocationId: centralStoreId,
                        toLocationId: locationId,
                        qty: String(line.needed),
                      },
                    })
                  }
                  accessibilityRole="button"
                  style={[styles.transferBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.navBtnText, { color: colors.onPrimary }]}>
                    {t('counting.transferFromCentral', { qty: line.needed })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}

          <Pressable
            onPress={() => router.replace('/(tabs)/inventory')}
            accessibilityRole="button"
            style={[styles.transferBtn, { backgroundColor: colors.healthy }]}
          >
            <Text style={[styles.navBtnText, { color: colors.onHealthy }]}>
              {t('counting.backToCounts')}
            </Text>
          </Pressable>
        </ScrollView>
      )}
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
    padding: space(2),
    gap: space(1.5),
    paddingBottom: space(4),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1.25),
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locTitle: {
    fontSize: type.body,
    fontWeight: '700',
  },
  progressText: {
    fontSize: type.body,
    fontWeight: '800',
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.chip,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: radius.chip,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space(1),
  },
  itemName: {
    fontSize: type.h2,
    fontWeight: '800',
  },
  itemMeta: {
    fontSize: type.small,
  },
  modeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    borderWidth: 1,
    borderRadius: radius.button,
    padding: space(1),
  },
  modeBannerText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  visibleInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space(1),
  },
  visibleSystemText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  unitChip: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    justifyContent: 'center',
  },
  unitChipText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  subSectionLabel: {
    fontSize: type.small,
    fontWeight: '700',
  },
  conditionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space(1),
  },
  condChip: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.25),
    justifyContent: 'center',
  },
  condChipText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  witnessBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.25),
    padding: space(1.5),
    borderRadius: radius.button,
    borderWidth: 1,
  },
  witnessTitle: {
    fontSize: type.small,
    fontWeight: '800',
  },
  witnessBody: {
    fontSize: type.small,
  },
  noteInput: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    fontSize: type.body,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: space(1),
  },
  utilBtn: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1),
  },
  utilBtnText: {
    fontSize: type.small,
    fontWeight: '700',
    textAlign: 'center',
  },
  navBar: {
    flexDirection: 'row',
    gap: space(1),
  },
  navBtn: {
    flex: 1,
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1.5),
  },
  navBtnText: {
    fontSize: type.body,
    fontWeight: '700',
    textAlign: 'center',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(1),
    paddingVertical: space(1),
    borderTopWidth: 1,
  },
  reviewItemName: {
    fontSize: type.body,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    padding: space(1.5),
    borderRadius: radius.button,
  },
  errorText: {
    flex: 1,
    fontSize: type.small,
    fontWeight: '700',
  },
  transferBtn: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(2),
  },
});
