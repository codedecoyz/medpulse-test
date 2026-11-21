import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { StatusChip } from './StatusChip';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type } from '@/theme/tokens';

export type ReadinessBand = 'ready' | 'partially_ready' | 'not_ready';
export type ReadinessConfidence = 'high' | 'medium' | 'low';

export interface ReadinessGaugeProps {
  score: number;
  band?: ReadinessBand;
  confidence?: ReadinessConfidence;
  size?: number;
  subtitle?: string;
  testID?: string;
}

export function resolveReadinessBand(score: number): ReadinessBand {
  if (score >= 85) return 'ready';
  if (score >= 60) return 'partially_ready';
  return 'not_ready';
}

/**
 * Circular emergency readiness gauge displaying 0-100% score, colored band chip,
 * and optional confidence indicator (Sections 10.3 & 11.4).
 */
export function ReadinessGauge({
  score,
  band,
  confidence,
  size = 132,
  subtitle,
  testID = 'readiness-gauge',
}: ReadinessGaugeProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const resolvedBand = band ?? resolveReadinessBand(clampedScore);

  const strokeWidth = 12;
  const half = size / 2;
  const radiusVal = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusVal;
  const progressOffset = circumference * (1 - clampedScore / 100);

  const strokeColor =
    resolvedBand === 'ready'
      ? colors.healthy
      : resolvedBand === 'partially_ready'
        ? colors.warning
        : colors.critical;

  const chipVariant =
    resolvedBand === 'ready' ? 'healthy' : resolvedBand === 'partially_ready' ? 'warning' : 'critical';

  const bandLabel = t(`scenarios.bands.${resolvedBand}`);
  const confidenceLabel = confidence
    ? t('scenarios.confidenceText', { level: t(`scenarios.confidenceLevels.${confidence}`) })
    : undefined;

  return (
    <View
      testID={testID}
      style={styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${clampedScore}%, ${bandLabel}${confidenceLabel ? `, ${confidenceLabel}` : ''}`}
    >
      <View style={[styles.ringContainer, { width: size, height: size }]}>
        <View style={{ transform: [{ rotate: '-90deg' }] }}>
          <Svg width={size} height={size}>
            <Circle
              cx={half}
              cy={half}
              r={radiusVal}
              stroke={colors.border}
              strokeWidth={strokeWidth}
              fill="none"
            />
            <Circle
              cx={half}
              cy={half}
              r={radiusVal}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={progressOffset}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </View>
        <View style={styles.centerOverlay}>
          <Text style={[styles.scoreText, { color: colors.text }]}>{clampedScore}%</Text>
        </View>
      </View>

      <StatusChip variant={chipVariant} label={bandLabel} />

      {confidenceLabel ? (
        <Text style={[styles.subtext, { color: colors.textSecondary }]}>{confidenceLabel}</Text>
      ) : null}
      {subtitle ? (
        <Text style={[styles.subtext, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: space(1),
  },
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: type.h1,
    fontWeight: '800',
  },
  subtext: {
    fontSize: type.small,
    textAlign: 'center',
  },
});
