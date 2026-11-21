import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import hi from '@/locales/hi.json';

export type AppLocale = 'en' | 'hi';

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
} as const;

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export async function changeAppLanguage(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
}

export default i18n;
