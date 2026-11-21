import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme/ThemeProvider';

export default function InventoryLayout() {
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
      <Stack.Screen name="[itemId]" options={{ title: t('inventory.itemDetailTitle') }} />
      <Stack.Screen name="movement" options={{ title: t('movement.screenTitle') }} />
      <Stack.Screen name="count" options={{ title: t('counting.screenTitle') }} />
    </Stack>
  );
}
