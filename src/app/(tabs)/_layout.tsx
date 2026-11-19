// src/app/(tabs)/_layout.tsx
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { CustomTabBar } from '../../components/navigation/CustomTabBar';
import { useAppPreferences } from '../../contexts/AppPreferences';

export default function TabsLayout() {
  const { onboardingCompleted } = useAppPreferences();
  if (!onboardingCompleted) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Beranda',
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Dompet',
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: 'Laporan',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Pengaturan',
        }}
      />
    </Tabs>
  );
}

