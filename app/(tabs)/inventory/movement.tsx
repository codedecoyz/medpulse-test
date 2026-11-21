import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScreenState } from '@/components/ScreenState';
import { StatusChip } from '@/components/StatusChip';
import { useAuth } from '@/features/auth/AuthProvider';
import { getDefaultFefoBatch, sortBatchesFefo } from '@/features/inventory/fefo';
import {
  type MovementValidationResult,
  validateMovementDraft,
} from '@/features/inventory/inventoryService';
import type {
  ManualMovementType,
  StockCondition,
} from '@/features/inventory/types';
import { formatUomConversion } from '@/features/inventory/uom';
import { useInventoryCatalog, useSubmitMovement } from '@/features/inventory/useInventory';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

const MOVEMENT_TYPES: ManualMovementType[] = [
  'receive',
  'issue',
  'transfer',
  'wastage',
  'adjustment',
];

const CONDITIONS: StockCondition[] = ['usable', 'damaged', 'expired', 'quarantined'];

export default function MovementScreen() {
  const params = useLocalSearchParams<{
    type?: string;
    itemId?: string;
    qty?: string;
    fromLocationId?: string;
    toLocationId?: string;
  }>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { profile, locations, activeLocationId } = useAuth();
  const catalogQuery = useInventoryCatalog();
  const submitMutation = useSubmitMovement();

  const snapshot = catalogQuery.data?.snapshot ?? null;
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);
  const reasonCodes = useMemo(() => snapshot?.reasonCodes ?? [], [snapshot]);

  const initialType: ManualMovementType = MOVEMENT_TYPES.includes(
    params.type as ManualMovementType,
  )
    ? (params.type as ManualMovementType)
    : 'issue';

  const [movType, setMovType] = useState<ManualMovementType>(initialType);
  const [itemFilter, setItemFilter] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string>(params.itemId ?? '');
  const [fromLocationId, setFromLocationId] = useState<string>(
    params.fromLocationId ?? activeLocationId ?? locations[0]?.id ?? '',
  );
  const [toLocationId, setToLocationId] = useState<string>(
    params.toLocationId ??
      locations.find((l) => l.id !== (params.fromLocationId ?? activeLocationId))?.id ??
      locations[0]?.id ??
      '',
  );
  const resolvedFromLocId = fromLocationId || activeLocationId || locations[0]?.id || '';
  const resolvedToLocId =
    toLocationId || locations.find((l) => l.id !== resolvedFromLocId)?.id || locations[0]?.id || '';
  const [adjustDirection, setAdjustDirection] = useState<'increase' | 'decrease'>('decrease');
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [qtyText, setQtyText] = useState(
    params.qty && /^\d+$/.test(params.qty) ? params.qty : '1',
  );
  const [condition, setCondition] = useState<StockCondition>('usable');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? items[0] ?? null,
    [items, selectedItemId],
  );

  const filteredPickerItems = useMemo(() => {
    const q = itemFilter.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      .slice(0, 12);
  }, [itemFilter, items]);

  const activeUnit = useMemo(() => {
    if (!selectedItem) return null;
    return (
      selectedItem.units.find((u) => u.unit === selectedUnit) ??
      selectedItem.units[0] ?? {
        itemId: selectedItem.id,
        unit: selectedItem.baseUnit,
        factorToBase: 1,
        isOrderPack: true,
      }
    );
  }, [selectedItem, selectedUnit]);

  const effectiveFromLocationId =
    movType === 'receive'
      ? null
      : movType === 'adjustment' && adjustDirection === 'increase'
        ? null
        : resolvedFromLocId || null;

  const effectiveToLocationId =
    movType === 'issue' || movType === 'wastage'
      ? null
      : movType === 'adjustment' && adjustDirection === 'decrease'
        ? null
        : resolvedToLocId || null;

  // FEFO batch list at source location (MP-INV-007)
  const fefoBatches = useMemo(() => {
    if (!selectedItem || !effectiveFromLocationId) return [];
    const atLoc = selectedItem.batchStocks.filter(
      (b) => b.locationId === effectiveFromLocationId && b.condition === condition,
    );
    return sortBatchesFefo(atLoc);
  }, [condition, effectiveFromLocationId, selectedItem]);

  // Earliest FEFO batch is automatically pre-selected unless user picks another valid batch
  const defaultFefoBatch = useMemo(() => getDefaultFefoBatch(fefoBatches), [fefoBatches]);
  const effectiveBatchId =
    movType === 'receive' || !selectedItem?.tracksBatch
      ? null
      : fefoBatches.some((b) => b.batchId === selectedBatchId)
        ? selectedBatchId
        : (defaultFefoBatch?.batchId ?? null);

  const canRecord = profile
    ? ['admin', 'store_manager', 'pharmacist', 'nurse'].includes(profile.role)
    : false;

  if (!canRecord) {
    return <ScreenState kind="permission_denied" />;
  }

  if (catalogQuery.isLoading) {
    return <ScreenState kind="loading" />;
  }

  if (!selectedItem) {
    return <ScreenState kind="empty" />;
  }

  const parsedQty = Number.parseInt(qtyText, 10);
  const safeQty = Number.isInteger(parsedQty) && parsedQty > 0 ? parsedQty : 0;
  const factor = activeUnit?.factorToBase ?? 1;
  const qtyBase = safeQty * factor;
  const conversionLabel = formatUomConversion(
    safeQty,
    activeUnit?.unit ?? selectedItem.baseUnit,
    factor,
    selectedItem.baseUnit,
  );

  const mapValidationError = (res: Extract<MovementValidationResult, { ok: false }>): string => {
    switch (res.code) {
      case 'INVALID_QTY':
        return t('movement.errors.invalidQty');
      case 'MISSING_LOCATION':
        return t('movement.errors.missingLocation');
      case 'SAME_LOCATION':
        return t('movement.errors.sameLocation');
      case 'BATCH_REQUIRED':
        return t('movement.errors.batchRequired');
      case 'EXPIRY_REQUIRED':
        return t('movement.errors.expiryRequired');
      case 'INVALID_EXPIRY_DATE':
        return t('movement.errors.invalidExpiryDate');
      case 'REASON_REQUIRED':
        return t('movement.errors.reasonRequired');
      case 'NOTE_REQUIRED':
        return t('movement.errors.noteRequired');
      case 'INSUFFICIENT_STOCK':
        return t('movement.errors.onlyAvailable', { available: res.available ?? 0 });
    }
  };

  const handleSubmit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const validation = validateMovementDraft({
      item: selectedItem,
      type: movType,
      qtyBase,
      condition,
      fromLocationId: effectiveFromLocationId,
      toLocationId: effectiveToLocationId,
      batchId: movType === 'receive' ? null : effectiveBatchId,
      batchNo: movType === 'receive' ? batchNo.trim() || null : null,
      expiryDate: movType === 'receive' && selectedItem.tracksExpiry ? expiryDate.trim() || null : null,
      reasonCode: movType === 'wastage' || movType === 'adjustment' ? reasonCode : null,
      note: note.trim() || null,
      reasonCodes,
    });

    if (!validation.ok) {
      setErrorMsg(mapValidationError(validation));
      return;
    }

    try {
      const result = await submitMutation.mutateAsync({
        draft: {
          itemId: selectedItem.id,
          type: movType,
          qtyBase,
          condition,
          fromLocationId: effectiveFromLocationId,
          toLocationId: effectiveToLocationId,
          batchId: movType === 'receive' ? null : effectiveBatchId,
          batchNo: movType === 'receive' ? batchNo.trim() || null : null,
          expiryDate: movType === 'receive' && selectedItem.tracksExpiry ? expiryDate.trim() || null : null,
          reasonCode: movType === 'wastage' || movType === 'adjustment' ? reasonCode : null,
          note: note.trim() || null,
        },
        itemName: selectedItem.name,
        unitSummary: conversionLabel,
      });

      setSuccessMsg(
        result.mode === 'queued' ? t('movement.queuedSuccess') : t('movement.syncedSuccess'),
      );
      setQtyText('1');
      setNote('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setErrorMsg(msg || t('movement.errors.submitFailed'));
    }
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Movement type */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {MOVEMENT_TYPES.map((typeKey) => {
          const active = movType === typeKey;
          return (
            <Pressable
              key={typeKey}
              testID={`mov-type-${typeKey}`}
              onPress={() => {
                setMovType(typeKey);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              accessibilityRole="button"
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                {t(`movement.types.${typeKey}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {errorMsg ? (
        <View
          testID="movement-error-banner"
          style={[styles.feedbackBanner, { backgroundColor: colors.critical }]}
          accessible
          accessibilityRole="alert"
        >
          <MaterialCommunityIcons name="alert-octagon-outline" size={20} color={colors.onCritical} />
          <Text style={[styles.feedbackText, { color: colors.onCritical }]}>{errorMsg}</Text>
        </View>
      ) : null}

      {successMsg ? (
        <View
          testID="movement-success-banner"
          style={[styles.feedbackBanner, { backgroundColor: colors.healthy }]}
          accessible
          accessibilityRole="alert"
        >
          <MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.onHealthy} />
          <Text style={[styles.feedbackText, { color: colors.onHealthy }]}>{successMsg}</Text>
        </View>
      ) : null}

      {/* Item Picker */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>{t('movement.selectItem')}</Text>
        {!params.itemId ? (
          <>
            <TextInput
              value={itemFilter}
              onChangeText={setItemFilter}
              placeholder={t('movement.searchItemPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
              ]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {filteredPickerItems.map((candidate) => {
                const active = candidate.id === selectedItem.id;
                return (
                  <Pressable
                    key={candidate.id}
                    onPress={() => {
                      setSelectedItemId(candidate.id);
                      setSelectedUnit(candidate.baseUnit);
                    }}
                    accessibilityRole="button"
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceSoft,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                      {candidate.sku} · {candidate.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
        <Text style={[styles.selectedSummary, { color: colors.text }]}>
          {selectedItem.name} ({selectedItem.sku})
        </Text>
      </View>

      {/* Location(s) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {movType === 'adjustment' ? (
          <View style={styles.chipRow}>
            {(['decrease', 'increase'] as const).map((dir) => {
              const active = adjustDirection === dir;
              return (
                <Pressable
                  key={dir}
                  onPress={() => setAdjustDirection(dir)}
                  accessibilityRole="button"
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.surfaceSoft,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                    {dir === 'increase'
                      ? t('movement.directionIncrease')
                      : t('movement.directionDecrease')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {effectiveFromLocationId !== null || movType === 'issue' || movType === 'transfer' || movType === 'wastage' || (movType === 'adjustment' && adjustDirection === 'decrease') ? (
          <>
            <Text style={[styles.label, { color: colors.text }]}>
              {movType === 'adjustment' ? t('movement.location') : t('movement.fromLocation')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {locations.map((loc) => {
                const active = loc.id === resolvedFromLocId;
                return (
                  <Pressable
                    key={loc.id}
                    onPress={() => setFromLocationId(loc.id)}
                    accessibilityRole="button"
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceSoft,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                      {loc.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {movType === 'receive' || movType === 'transfer' || (movType === 'adjustment' && adjustDirection === 'increase') ? (
          <>
            <Text style={[styles.label, { color: colors.text }]}>
              {movType === 'adjustment' ? t('movement.location') : t('movement.toLocation')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {locations.map((loc) => {
                const active = loc.id === resolvedToLocId;
                return (
                  <Pressable
                    key={loc.id}
                    onPress={() => setToLocationId(loc.id)}
                    accessibilityRole="button"
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceSoft,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                      {loc.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
      </View>

      {/* Unit & Quantity */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>{t('movement.unitOfMeasure')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {selectedItem.units.map((u) => {
            const active = activeUnit?.unit === u.unit;
            return (
              <Pressable
                key={u.unit}
                testID={`mov-uom-${u.unit}`}
                onPress={() => setSelectedUnit(u.unit)}
                accessibilityRole="button"
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceSoft,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                  {u.unit} (x{u.factorToBase})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: colors.text }]}>{t('movement.quantity')}</Text>
        <View style={styles.stepperRow}>
          <Pressable
            onPress={() => setQtyText(String(Math.max(safeQty - 1, 1)))}
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
            style={[styles.stepperBtn, { backgroundColor: colors.healthy }]}
          >
            <Text style={[styles.stepperText, { color: colors.onHealthy }]}>−</Text>
          </Pressable>
          <TextInput
            testID="mov-qty-input"
            value={qtyText}
            onChangeText={setQtyText}
            keyboardType="number-pad"
            accessibilityLabel={t('movement.quantity')}
            style={[
              styles.qtyInput,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
            ]}
          />
          <Pressable
            onPress={() => setQtyText(String(safeQty + 1))}
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
            style={[styles.stepperBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.stepperText, { color: colors.onPrimary }]}>+</Text>
          </Pressable>
        </View>
        <Text testID="mov-conversion-text" style={[styles.conversionText, { color: colors.textSecondary }]}>
          {conversionLabel}
        </Text>
      </View>

      {/* Batch / Expiry (Receive vs FEFO Outbound) */}
      {movType === 'receive' && selectedItem.tracksBatch ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>{t('movement.batchNo')}</Text>
          <TextInput
            testID="mov-batch-input"
            value={batchNo}
            onChangeText={setBatchNo}
            placeholder={t('movement.batchNoPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
            ]}
          />
          {selectedItem.tracksExpiry ? (
            <>
              <Text style={[styles.label, { color: colors.text }]}>{t('movement.expiryDate')}</Text>
              <TextInput
                testID="mov-expiry-input"
                value={expiryDate}
                onChangeText={setExpiryDate}
                placeholder={t('movement.expiryPlaceholder')}
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
                ]}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {movType !== 'receive' && selectedItem.tracksBatch ? (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>
            {t('movement.batchSelectionFefo')}
          </Text>
          {fefoBatches.length === 0 ? (
            <StatusChip variant="critical" label={t('movement.noUsableBatches')} />
          ) : (
            <View style={styles.batchList}>
              {fefoBatches.map((b, idx) => {
                const active = b.batchId === effectiveBatchId;
                return (
                  <Pressable
                    key={`${b.batchId ?? 'none'}-${idx}`}
                    testID={`mov-fefo-batch-${b.batchNo}`}
                    onPress={() => setSelectedBatchId(b.batchId)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.batchRow,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceSoft,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                      {b.batchNo} · {b.availableQty} {selectedItem.baseUnit}
                      {b.expiryDate ? ` · ${t('inventory.expiresOn', { date: b.expiryDate })}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {/* Condition & Reason Code */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.text }]}>{t('movement.condition')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {CONDITIONS.map((cond) => {
            const active = condition === cond;
            return (
              <Pressable
                key={cond}
                onPress={() => setCondition(cond)}
                accessibilityRole="button"
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surfaceSoft,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                  {t(`inventory.conditions.${cond}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {movType === 'wastage' || movType === 'adjustment' ? (
          <>
            <Text style={[styles.label, { color: colors.text }]}>{t('movement.reasonCode')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {reasonCodes.map((reason) => {
                const active = reason.code === reasonCode;
                return (
                  <Pressable
                    key={reason.code}
                    testID={`mov-reason-${reason.code}`}
                    onPress={() => setReasonCode(reason.code)}
                    accessibilityRole="button"
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceSoft,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onPrimary : colors.text }]}>
                      {reason.labelEn}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        <Text style={[styles.label, { color: colors.text }]}>{t('movement.note')}</Text>
        <TextInput
          testID="mov-note-input"
          value={note}
          onChangeText={setNote}
          placeholder={t('movement.notePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSoft },
          ]}
        />
      </View>

      <Pressable
        testID="mov-submit-btn"
        onPress={() => void handleSubmit()}
        disabled={submitMutation.isPending}
        accessibilityRole="button"
        accessibilityLabel={t('movement.confirm')}
        style={({ pressed }) => [
          styles.submitBtn,
          {
            backgroundColor: pressed ? colors.critical : colors.primary,
            opacity: submitMutation.isPending ? 0.7 : 1,
          },
        ]}
      >
        <Text style={[styles.submitText, { color: colors.onPrimary }]}>
          {submitMutation.isPending ? t('movement.submitting') : t('movement.confirm')}
        </Text>
      </Pressable>
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
    paddingBottom: space(4),
  },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space(2),
    gap: space(1),
  },
  label: {
    fontSize: type.small,
    fontWeight: '700',
  },
  selectedSummary: {
    fontSize: type.body,
    fontWeight: '700',
  },
  chipRow: {
    gap: space(1),
  },
  chip: {
    minHeight: touchTarget.min,
    paddingHorizontal: space(1.5),
    borderRadius: radius.button,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  input: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    fontSize: type.body,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
  },
  stepperBtn: {
    width: touchTarget.counter,
    height: touchTarget.counter,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: {
    fontSize: type.h1,
    fontWeight: '700',
  },
  qtyInput: {
    flex: 1,
    minHeight: touchTarget.counter,
    borderRadius: radius.button,
    borderWidth: 1,
    fontSize: type.h2,
    fontWeight: '700',
    textAlign: 'center',
  },
  conversionText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  batchList: {
    gap: space(1),
  },
  batchRow: {
    minHeight: touchTarget.min,
    borderRadius: radius.button,
    borderWidth: 1,
    paddingHorizontal: space(1.5),
    justifyContent: 'center',
  },
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space(1.5),
    borderRadius: radius.button,
    gap: space(1),
  },
  feedbackText: {
    flex: 1,
    fontSize: type.small,
    fontWeight: '700',
  },
  submitBtn: {
    minHeight: touchTarget.counter,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: type.body,
    fontWeight: '700',
  },
});
