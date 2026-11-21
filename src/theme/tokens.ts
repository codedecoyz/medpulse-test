export interface ThemeColors {
  background: string;
  surfaceSoft: string;
  healthy: string;
  warning: string;
  primary: string;
  critical: string;
  text: string;
  textSecondary: string;
  link: string;
  card: string;
  border: string;
  onPrimary: string;
  onCritical: string;
  onWarning: string;
  onHealthy: string;
}

/**
 * Light theme tokens strictly matching MedPulse-SPEC.md Section 11.3.
 */
export const colors: ThemeColors = {
  background: '#ddfff7', // Frozen Water
  surfaceSoft: '#ddfff7',
  healthy: '#93e1d8', // Pearl Aqua
  warning: '#ffa69e', // Powder Blush (use dark text)
  primary: '#aa4465', // Berry Crush
  critical: '#861657', // Dark Raspberry
  text: '#2B0F20',
  textSecondary: '#6B4A5C',
  link: '#aa4465',
  card: '#FFFFFF',
  border: '#CDEFE8',
  onPrimary: '#FFFFFF',
  onCritical: '#FFFFFF',
  onWarning: '#2B0F20',
  onHealthy: '#2B0F20',
};

/**
 * Dark theme tokens derived from Dark Raspberry and near-black surfaces (MP-I18N-004).
 */
export const darkColors: ThemeColors = {
  background: '#160811',
  surfaceSoft: '#240E1C',
  healthy: '#93e1d8', // Pearl Aqua
  warning: '#ffa69e', // Powder Blush
  primary: '#aa4465', // Berry Crush
  critical: '#861657', // Dark Raspberry
  text: '#F4FFFC',
  textSecondary: '#CBECE5',
  link: '#93e1d8',
  card: '#2B1021',
  border: '#4D203B',
  onPrimary: '#FFFFFF',
  onCritical: '#FFFFFF',
  onWarning: '#2B0F20',
  onHealthy: '#2B0F20',
};

export const radius = {
  card: 16,
  button: 12,
  chip: 999,
} as const;

export const space = (n: number): number => n * 8;

export const type = {
  h1: 28,
  h2: 22,
  h3: 18,
  body: 16,
  small: 14,
  counter: 48,
} as const;

export const touchTarget = {
  min: 48,
  counter: 56,
} as const;
