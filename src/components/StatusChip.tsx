import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';

export type StatusChipVariant = 'healthy' | 'warning' | 'critical' | 'in_testing';

interface StatusChipProps {
  variant: StatusChipVariant;
  label?: string;
}

const VARIANT_ICONS: Record<StatusChipVariant, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  healthy: 'check-circle-outline',
  warning: 'alert-outline',
  critical: 'alert-octagon-outline',
  in_testing: 'flask-outline',
};

/**
 * Accessible status badge that always pairs color with an icon and text label
 * (Principle P8, MP-ALR-003, MP-SCN-002).
 */
export function StatusChip({ variant, label }: StatusChipProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const palette = {
    healthy: { bg: colors.healthy, fg: colors.onHealthy, text: t('status.healthy') },
    warning: { bg: colors.warning, fg: colors.onWarning, text: t('status.warning') },
    critical: { bg: colors.critical, fg: colors.onCritical, text: t('status.critical') },
    in_testing: { bg: colors.warning, fg: colors.onWarning, text: t('status.in_testing') },
  }[variant];

  const resolvedLabel = label ?? palette.text;

  return (
    <View
      style={[styles.chip, { backgroundColor: palette.bg }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={resolvedLabel}
    >
      <MaterialCommunityIcons
        name={VARIANT_ICONS[variant]}
        size={16}
        color={palette.fg}
        style={styles.icon}
      />
      <Text style={[styles.label, { color: palette.fg }]}>{resolvedLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: space(1.5),
    paddingVertical: space(0.5),
    borderRadius: radius.chip,
  },
  icon: {
    marginRight: space(0.75),
  },
  label: {
    fontSize: type.small,
    fontWeight: '600',
  },
});
