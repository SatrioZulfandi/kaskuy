// src/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';
import { CustomTabBar } from '../../components/navigation/CustomTabBar';

export default function TabsLayout() {
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

