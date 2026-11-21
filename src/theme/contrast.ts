import type { ThemeColors } from './tokens';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ContrastPairCheck {
  name: string;
  foregroundKey: keyof ThemeColors;
  backgroundKey: keyof ThemeColors;
  minimumRatio: number;
}

export interface ContrastCheckResult {
  name: string;
  foreground: string;
  background: string;
  ratio: number;
  minimumRatio: number;
  passes: boolean;
}

export const WCAG_AA_NORMAL_TEXT = 4.5;

export const TOKEN_CONTRAST_PAIRS: readonly ContrastPairCheck[] = [
  { name: 'text on background', foregroundKey: 'text', backgroundKey: 'background', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'textSecondary on background', foregroundKey: 'textSecondary', backgroundKey: 'background', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'text on card', foregroundKey: 'text', backgroundKey: 'card', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'textSecondary on card', foregroundKey: 'textSecondary', backgroundKey: 'card', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'text on surfaceSoft', foregroundKey: 'text', backgroundKey: 'surfaceSoft', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'link on background', foregroundKey: 'link', backgroundKey: 'background', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'link on card', foregroundKey: 'link', backgroundKey: 'card', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'onPrimary on primary', foregroundKey: 'onPrimary', backgroundKey: 'primary', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'onCritical on critical', foregroundKey: 'onCritical', backgroundKey: 'critical', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'onWarning on warning', foregroundKey: 'onWarning', backgroundKey: 'warning', minimumRatio: WCAG_AA_NORMAL_TEXT },
  { name: 'onHealthy on healthy', foregroundKey: 'onHealthy', backgroundKey: 'healthy', minimumRatio: WCAG_AA_NORMAL_TEXT },
];

export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid 6-digit hex color: ${hex}`);
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function linearizeChannel(channel255: number): number {
  const srgb = channel255 / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = relativeLuminance(foregroundHex);
  const l2 = relativeLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateThemeContrast(themeColors: ThemeColors): ContrastCheckResult[] {
  return TOKEN_CONTRAST_PAIRS.map((pair) => {
    const foreground = themeColors[pair.foregroundKey];
    const background = themeColors[pair.backgroundKey];
    const ratio = getContrastRatio(foreground, background);
    return {
      name: pair.name,
      foreground,
      background,
      ratio,
      minimumRatio: pair.minimumRatio,
      passes: ratio >= pair.minimumRatio,
    };
  });
}
