import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';

export default function MoreLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="reports" options={{ title: t('reports.title') }} />
      <Stack.Screen name="settings" options={{ title: t('more.settings') }} />
      <Stack.Screen name="about" options={{ title: t('more.about') }} />
    </Stack>
  );
}
