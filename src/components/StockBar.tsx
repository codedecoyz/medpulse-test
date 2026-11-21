import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space, type } from '@/theme/tokens';

interface StockBarProps {
  usable: number;
  minQty: number | null;
  parQty: number | null;
  maxQty: number | null;
  unit: string;
}

/**
 * Displays usable stock relative to min/PAR/max thresholds with both color and
 * accessible text labels (Section 11.4, Principle P8).
 */
export function StockBar({ usable, minQty, parQty, maxQty, unit }: StockBarProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const scaleMax =
    maxQty && maxQty > 0
      ? maxQty
      : parQty && parQty > 0
        ? Math.ceil(parQty * 1.5)
        : Math.max(usable, 1);

  const fillPct = Math.min(Math.max((usable / scaleMax) * 100, 0), 100);
  const parMarkerPct = parQty && parQty > 0 ? Math.min((parQty / scaleMax) * 100, 100) : null;

  const severity =
    usable <= 0 || (minQty !== null && usable <= minQty)
      ? 'critical'
      : parQty !== null && usable < parQty
        ? 'warning'
        : 'healthy';

  const barColor =
    severity === 'critical'
      ? colors.critical
      : severity === 'warning'
        ? colors.warning
        : colors.healthy;

  const iconName =
    severity === 'critical'
      ? 'alert-octagon-outline'
      : severity === 'warning'
        ? 'alert-outline'
        : 'check-circle-outline';

  const parText = parQty !== null ? t('inventory.parSummary', { par: parQty }) : t('inventory.noPar');
  const summaryText = `${t('inventory.usableLabel', { qty: usable, unit })} · ${parText}`;

  return (
    <View style={styles.wrap} accessible accessibilityLabel={summaryText}>
      <View style={styles.labelRow}>
        <MaterialCommunityIcons
          name={iconName}
          size={15}
          color={severity === 'critical' ? colors.critical : colors.textSecondary}
        />
        <Text style={[styles.labelText, { color: colors.text }]}>{summaryText}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
        <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: barColor }]} />
        {parMarkerPct !== null ? (
          <View
            style={[
              styles.parMarker,
              { left: `${parMarkerPct}%`, backgroundColor: colors.text },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space(0.5),
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(0.75),
  },
  labelText: {
    fontSize: type.small,
    fontWeight: '600',
  },
  track: {
    height: 10,
    borderRadius: radius.chip,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: radius.chip,
  },
  parMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
  },
});
