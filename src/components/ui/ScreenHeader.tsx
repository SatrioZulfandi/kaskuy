import { router } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StatusBar, Text, View } from 'react-native';
import { useTopInset } from '../../hooks/useTopInset';
import { Icon } from './Icon';
import { LinearGradient } from './LinearGradient';

export function ScreenHeader({ title, subtitle, action, back = true }: {
  title: string; subtitle?: string; action?: React.ReactNode; back?: boolean;
}) {
  const topInset = useTopInset(12);
  return <LinearGradient variant="header" colors={['#0052CC', '#1B365D']} style={{ paddingTop: topInset, paddingHorizontal: 20, paddingBottom: 20 }}>
    <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {back && <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Kembali" hitSlop={8} style={{ padding: 8 }}>
        <Icon name="chevLeft" color="#FFFFFF" size={22} />
      </Pressable>}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 21, fontWeight: '700', color: '#FFFFFF' }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 12, color: '#E4EEFF', marginTop: 4 }}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  </LinearGradient>;
}
