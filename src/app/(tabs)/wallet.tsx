// src/app/(tabs)/wallet.tsx
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BatikPattern } from '../../components/decorative/BatikPattern';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Colors, Radius, Typography } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getTotalBalance, getWallets } from '../../db/repositories/walletRepo';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { Wallet } from '../../types';

const SUB_TABS = ['Saldo', 'Tabungan', 'Tagihan', 'Utang'] as const;

export default function WalletScreen() {
  const topInset = useTopInset(12);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>('Saldo');
  const [refreshing, setRefreshing] = useState(false);

  const loadWallets = useCallback(async () => {
    try {
      const book = await getDefaultBook();
      if (!book) return;

      const list = await getWallets(book.id);
      setWallets(list);

      const total = await getTotalBalance(book.id);
      setTotalBalance(total);
    } catch (err) {
      console.error('Failed to load wallets:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWallets();
    }, [loadWallets])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWallets();
    setRefreshing(false);
  };

  const handleTabPress = (tab: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    setActiveTab(tab);
  };

  const getWalletTypeLabel = (type: string) => {
    switch (type) {
      case 'cash':
        return 'Uang Tunai';
      case 'bank':
        return 'Rekening Bank';
      case 'ewallet':
        return 'E-Wallet';
      case 'credit_card':
        return 'Kartu Kredit';
      default:
        return 'Dompet';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.gradientStart, Colors.light.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <View style={styles.topRow}>
            <Text style={styles.screenTitle}>Dompet Saya</Text>
            <Pressable
              onPress={() => router.push('/wallet/add' as any)}
              style={styles.headerActionBtn}
            >
              <Icon name="plus" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Sub-tabs: Saldo / Tabungan / Tagihan / Utang */}
          <View style={styles.subTabRow}>
            {SUB_TABS.map((tab) => {
              const active = activeTab === tab;
              return (
                <Pressable
                  key={tab}
                  onPress={() => handleTabPress(tab)}
                  style={[styles.subTabPill, active && styles.subTabPillActive]}
                >
                  <Text style={[styles.subTabPillText, active && styles.subTabPillTextActive]}>
                    {tab}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Total Balance Card */}
          <View style={styles.totalCard}>
            <BatikPattern opacity={0.14} color="#FFFFFF" />
            <Text style={styles.totalLabel}>Total Saldo Tersedia</Text>
            <AmountDisplay amount={totalBalance} size="hero" style={styles.totalValue} />
          </View>
        </LinearGradient>
      </View>

      <View style={styles.contentBody}>
        <FlatList
          data={wallets}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <Pressable
              onPress={() => router.push('/wallet/add' as any)}
              style={({ pressed }) => [
                styles.addWalletCard,
                pressed && styles.addWalletCardPressed,
              ]}
            >
              <View style={styles.addWalletIconWrap}>
                <Icon name="plus" size={20} color={Colors.light.primary} />
              </View>
              <Text style={styles.addWalletText}>Tambah Dompet Baru</Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/wallet/${item.id}` as any)}
              style={({ pressed }) => [
                styles.walletCard,
                pressed && styles.walletCardPressed,
              ]}
            >
              <View
                style={[
                  styles.walletIconWrap,
                  { backgroundColor: `${item.color}15` },
                ]}
              >
                <Icon name={item.icon || 'wallet'} size={24} color={item.color} />
              </View>

              <View style={styles.walletDetails}>
                <Text style={styles.walletName}>{item.name}</Text>
                <Text style={styles.walletType}>{getWalletTypeLabel(item.type)}</Text>
              </View>

              <AmountDisplay
                amount={item.balance}
                size="md"
                type={item.balance < 0 ? 'expense' : 'neutral'}
              />
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primaryDark,
  },
  headerContainer: {
    backgroundColor: Colors.light.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: Typography.header.fontSize,
    fontWeight: Typography.header.fontWeight,
    color: '#FFFFFF',
  },
  headerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: 16,
  },
  subTabPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  subTabPillActive: {
    backgroundColor: '#FFFFFF',
  },
  subTabPillText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  subTabPillTextActive: {
    color: Colors.light.primary,
    fontWeight: '600',
  },
  totalCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    position: 'relative',
    overflow: 'hidden',
  },
  totalLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    marginBottom: 4,
  },
  totalValue: {
    color: '#FFFFFF',
  },
  contentBody: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -12,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  listContent: {
    paddingBottom: 28,
    gap: 12,
  },
  walletCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  walletCardPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.9,
  },
  walletIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletDetails: {
    flex: 1,
  },
  walletName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  walletType: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  addWalletCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: Radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  addWalletCardPressed: {
    backgroundColor: '#F3F4F6',
  },
  addWalletIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addWalletText: {
    color: Colors.light.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});

