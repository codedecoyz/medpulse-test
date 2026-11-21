import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '@/lib/i18n';
import { ScreenState } from '@/components/ScreenState';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function RootNavigator() {
  const { status } = useAuth();
  const { mode, colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!rootNavigationState?.key || status === 'loading') {
      return;
    }

    const segmentList = segments as string[];
    const inAuthGroup = segmentList[0] === '(auth)';
    const currentAuthScreen = segmentList[1];

    if (status === 'unauthenticated' || status === 'locked') {
      if (!inAuthGroup || currentAuthScreen !== 'login') {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (status === 'no_role') {
      if (!inAuthGroup || currentAuthScreen !== 'no-role') {
        router.replace('/(auth)/no-role');
      }
      return;
    }

    if (status === 'authenticated' && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [rootNavigationState?.key, router, segments, status]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      {status === 'loading' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          <ScreenState kind="loading" />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
