// src/app/_layout.tsx
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDatabase } from '../hooks/useDatabase';
import { AppPreferencesProvider, useAppPreferences } from '../contexts/AppPreferences';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { isReady, error, retry } = useDatabase();

  useEffect(() => {
    if (isReady || error) {
      SplashScreen.hideAsync();
    }
  }, [isReady, error]);

  if (!isReady && !error) {
    return null;
  }
  if (error) {
    return <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: '#F5F7FA' }}>
      <Text style={{ color: '#1B365D', fontWeight: '700' }}>Data belum dapat dibuka</Text>
      <Text style={{ color: '#6B7280', textAlign: 'center' }}>Tutup aplikasi lain lalu coba lagi. Data Anda tidak dihapus.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={{ padding: 16 }}><Text style={{ color: '#0052CC' }}>Coba Lagi</Text></Pressable>
    </View>;
  }
  return <AppPreferencesProvider><RootNavigator /></AppPreferencesProvider>;
}

function RootNavigator() {
  const { colorScheme } = useAppPreferences();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="scan/index"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="transaction/add"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen name="transaction/[id]" />
        <Stack.Screen
          name="wallet/add"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen name="wallet/[id]" />
        <Stack.Screen
          name="budget/add"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
