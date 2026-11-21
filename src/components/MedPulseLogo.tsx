import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

interface MedPulseLogoProps {
  size?: number;
}

/**
 * MedPulse brand mark: heartbeat line inside a medical cross (Section 11.2).
 */
export function MedPulseLogo({ size = 72 }: MedPulseLogoProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size * 0.24,
          backgroundColor: colors.primary,
        },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="MedPulse logo"
    >
      <Svg width={size * 0.72} height={size * 0.72} viewBox="0 0 64 64" fill="none">
        {/* Medical cross */}
        <Rect x="24" y="6" width="16" height="52" rx="4" fill={colors.onPrimary} opacity={0.22} />
        <Rect x="6" y="24" width="52" height="16" rx="4" fill={colors.onPrimary} opacity={0.22} />
        <Rect x="25" y="7" width="14" height="50" rx="3.5" stroke={colors.onPrimary} strokeWidth="2.5" />
        <Rect x="7" y="25" width="50" height="14" rx="3.5" stroke={colors.onPrimary} strokeWidth="2.5" />
        {/* Heartbeat pulse line */}
        <Path
          d="M11 32 H21 L25 22 L30 43 L35 26 L39 34 H53"
          stroke={colors.healthy}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
