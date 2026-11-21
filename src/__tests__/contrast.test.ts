import { getContrastRatio, validateThemeContrast } from '@/theme/contrast';
import { colors, darkColors } from '@/theme/tokens';

describe('WCAG 2.1 AA theme contrast checks (MP-I18N-002, MP-I18N-004)', () => {
  it('computes exact contrast bounds for black and white', () => {
    expect(getContrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(getContrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('rejects invalid hex strings', () => {
    expect(() => getContrastRatio('not-a-hex', '#FFFFFF')).toThrow();
  });

  it('passes >= 4.5:1 contrast on all light theme token pairs', () => {
    const results = validateThemeContrast(colors);
    for (const check of results) {
      expect({
        name: check.name,
        ratio: Number(check.ratio.toFixed(2)),
        passes: check.passes,
      }).toEqual({
        name: check.name,
        ratio: expect.any(Number),
        passes: true,
      });
      expect(check.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('passes >= 4.5:1 contrast on all dark theme token pairs', () => {
    const results = validateThemeContrast(darkColors);
    for (const check of results) {
      expect({
        name: check.name,
        ratio: Number(check.ratio.toFixed(2)),
        passes: check.passes,
      }).toEqual({
        name: check.name,
        ratio: expect.any(Number),
        passes: true,
      });
      expect(check.ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});
