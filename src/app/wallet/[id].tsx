// src/app/wallet/[id].tsx
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BatikPattern } from '../../components/decorative/BatikPattern';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Colors, Radius, Typography } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getTransactions } from '../../db/repositories/transactionRepo';
import { deleteWallet, getWalletById } from '../../db/repositories/walletRepo';
import { formatReadableDate } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { TransactionWithDetails, Wallet } from '../../types';

export default function WalletDetailScreen() {
  const topInset = useTopInset(12);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!id) return;
      try {
        const w = await getWalletById(Number(id));
        setWallet(w);

        const book = await getDefaultBook();
        if (book) {
          const list = await getTransactions(book.id, {
            walletId: Number(id),
            limit: 50,
          });
          setTransactions(list);
        }
      } catch (err) {
        console.error('Failed to load wallet detail:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleDelete = () => {
    Alert.alert(
      'Hapus Dompet',
      'Apakah Anda yakin ingin menghapus dompet ini? Riwayat transaksi lama mungkin terpengaruh.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            if (!wallet) return;
            try {
              await deleteWallet(wallet.id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (err: any) {
              Alert.alert('Gagal Menghapus', err?.message);
            }
          },
        },
      ]
    );
  };

  if (loading || !wallet) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Memuat detail dompet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[wallet.color || Colors.light.gradientStart, Colors.light.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Icon name="chevLeft" size={20} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.screenTitle}>{wallet.name}</Text>
            <Pressable onPress={handleDelete} style={styles.deleteBtn}>
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.balanceCard}>
            <BatikPattern opacity={0.14} color="#FFFFFF" />
            <Text style={styles.balanceSub}>Saldo Saat Ini</Text>
            <AmountDisplay
              amount={wallet.balance}
              size="hero"
              style={{ color: '#FFFFFF' }}
            />
          </View>
        </LinearGradient>
      </View>

      <View style={styles.contentBody}>
        <Text style={styles.sectionTitle}>Riwayat Transaksi Dompet Ini</Text>

        <FlatList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="wallet"
              title="Belum Ada Transaksi"
              subtitle="Belum ada catatan pengeluaran atau pemasukan yang menggunakan dompet ini."
            />
          }
          renderItem={({ item }) => {
            const isIncome = item.type === 'income';
            return (
              <Pressable
                onPress={() => router.push(`/transaction/${item.id}` as any)}
                style={styles.txCard}
              >
                <View
                  style={[
                    styles.catIconWrap,
                    { backgroundColor: `${item.category_color}18` },
                  ]}
                >
                  <Icon name={item.category_icon || 'other'} size={20} color={item.category_color} />
                </View>

                <View style={styles.txDetails}>
                  <Text style={styles.txTitle}>{item.note || item.category_name}</Text>
                  <Text style={styles.txSub}>
                    {item.category_name} · {formatReadableDate(item.date)}
                  </Text>
                </View>

                <AmountDisplay
                  amount={item.amount}
                  type={isIncome ? 'income' : 'expense'}
                  showSign
                  size="md"
                />
              </Pressable>
            );
          }}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  headerContainer: {
    backgroundColor: Colors.light.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 22,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 71, 87, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: Typography.header.fontSize,
    fontWeight: Typography.header.fontWeight,
    color: '#FFFFFF',
  },
  balanceCard: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    position: 'relative',
    overflow: 'hidden',
  },
  balanceSub: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    marginBottom: 4,
  },
  contentBody: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -12,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: Typography.title.fontSize,
    fontWeight: Typography.title.fontWeight,
    color: Colors.light.text,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  txCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  catIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txDetails: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  txSub: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
});

