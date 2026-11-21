import i18n, { changeAppLanguage } from '@/lib/i18n';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      throw new Error(`Unexpected value type at key ${fullKey}`);
    }
  }
  return result;
}

describe('i18n English & Hindi parity (MP-I18N-001)', () => {
  afterEach(async () => {
    await changeAppLanguage('en');
  });

  it('has identical translation keys and non-empty strings in en and hi', () => {
    const enFlat = flattenKeys(en);
    const hiFlat = flattenKeys(hi);

    expect(Object.keys(hiFlat).sort()).toEqual(Object.keys(enFlat).sort());
    for (const [key, val] of Object.entries(enFlat)) {
      expect({ key, len: val.trim().length }).toEqual({ key, len: expect.any(Number) });
      expect(val.trim().length).toBeGreaterThan(0);
    }
    for (const [key, val] of Object.entries(hiFlat)) {
      expect({ key, len: val.trim().length }).toEqual({ key, len: expect.any(Number) });
      expect(val.trim().length).toBeGreaterThan(0);
    }
  });

  it('switches language immediately without restarting', async () => {
    expect(i18n.t('tabs.home')).toBe('Home');
    await changeAppLanguage('hi');
    expect(i18n.language).toBe('hi');
    expect(i18n.t('tabs.home')).toBe('होम');
    expect(i18n.t('status.in_testing')).toBe('परीक्षण में');
  });
});
