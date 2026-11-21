import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, touchTarget, type } from '@/theme/tokens';

export interface CounterProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  conversionText?: string;
  testID?: string;
}

const QUICK_ADD_CHIPS = [5, 10, 50] as const;

/**
 * Large glove-friendly stock counter control with >= 56px -/+ buttons,
 * tap-to-type numeric entry, and quick-add chips (MP-CNT-005, MP-I18N-003).
 */
export function Counter({
  value,
  onChange,
  min = 0,
  max = 999999,
  label,
  conversionText,
  testID = 'stock-counter',
}: CounterProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(String(value));

  const clamp = (n: number): number => Math.max(min, Math.min(max, Math.trunc(n)));

  const commitDraft = () => {
    const parsed = Number.parseInt(draftText.replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(parsed)) {
      onChange(clamp(parsed));
    }
    setEditing(false);
  };

  const openEditor = () => {
    setDraftText(String(value));
    setEditing(true);
  };

  const a11yLabel = label
    ? t('counting.counterA11yLabel', { label, value })
    : t('counting.counterQuantityLabel', { value });

  return (
    <View
      testID={testID}
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityLabel={a11yLabel}
      accessibilityValue={{ min, max, now: value }}
    >
      <View style={styles.mainRow}>
        <Pressable
          testID={`${testID}-minus`}
          onPress={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={t('counting.decrement')}
          style={({ pressed }) => [
            styles.stepButton,
            {
              backgroundColor: pressed ? colors.border : colors.surfaceSoft,
              borderColor: colors.border,
              opacity: value <= min ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[styles.stepLabel, { color: colors.text }]}>−</Text>
        </Pressable>

        {editing ? (
          <TextInput
            testID={`${testID}-input`}
            value={draftText}
            onChangeText={(txt) => setDraftText(txt.replace(/[^0-9]/g, ''))}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
            accessibilityLabel={a11yLabel}
            style={[
              styles.numberInput,
              {
                color: colors.text,
                borderColor: colors.primary,
                backgroundColor: colors.surfaceSoft,
              },
            ]}
          />
        ) : (
          <Pressable
            testID={`${testID}-readout`}
            onPress={openEditor}
            accessibilityRole="button"
            accessibilityLabel={t('counting.tapToTypeHint', { value })}
            style={[styles.readoutBox, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Text style={[styles.readoutText, { color: colors.text }]}>{value}</Text>
          </Pressable>
        )}

        <Pressable
          testID={`${testID}-plus`}
          onPress={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={t('counting.increment')}
          style={({ pressed }) => [
            styles.stepButton,
            {
              backgroundColor: pressed ? colors.critical : colors.primary,
              borderColor: pressed ? colors.critical : colors.primary,
              opacity: value >= max ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[styles.stepLabel, { color: colors.onPrimary }]}>+</Text>
        </Pressable>
      </View>

      {conversionText ? (
        <Text style={[styles.conversionText, { color: colors.textSecondary }]}>
          {conversionText}
        </Text>
      ) : null}

      <View style={styles.chipRow}>
        {QUICK_ADD_CHIPS.map((delta) => (
          <Pressable
            key={delta}
            testID={`${testID}-add-${delta}`}
            onPress={() => onChange(clamp(value + delta))}
            accessibilityRole="button"
            accessibilityLabel={`+${delta}`}
            style={({ pressed }) => [
              styles.quickChip,
              {
                backgroundColor: pressed ? colors.primary : colors.surfaceSoft,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.quickChipText, { color: colors.text }]}>+{delta}</Text>
          </Pressable>
        ))}

        <Pressable
          testID={`${testID}-zero`}
          onPress={() => onChange(min)}
          accessibilityRole="button"
          accessibilityLabel={t('counting.zeroAction')}
          style={({ pressed }) => [
            styles.quickChip,
            {
              backgroundColor: pressed ? colors.warning : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.quickChipText, { color: colors.textSecondary }]}>0</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space(1.5),
    alignItems: 'center',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    width: '100%',
  },
  stepButton: {
    minWidth: touchTarget.counter,
    minHeight: touchTarget.counter,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(2),
  },
  stepLabel: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  readoutBox: {
    minWidth: 112,
    minHeight: touchTarget.counter,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(2),
  },
  readoutText: {
    fontSize: type.counter,
    fontWeight: '800',
  },
  numberInput: {
    minWidth: 112,
    minHeight: touchTarget.counter,
    borderRadius: radius.button,
    borderWidth: 2,
    fontSize: type.h1,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: space(1.5),
  },
  conversionText: {
    fontSize: type.small,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space(1),
  },
  quickChip: {
    minHeight: touchTarget.min,
    minWidth: 56,
    borderRadius: radius.button,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space(1.5),
  },
  quickChipText: {
    fontSize: type.body,
    fontWeight: '700',
  },
});
