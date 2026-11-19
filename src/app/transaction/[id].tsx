import { useTheme, useThemedStyles } from '../../hooks/use-theme';
// src/app/transaction/[id].tsx
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Typography, type ThemeColors } from '../../constants/theme';
import {
  deleteTransaction,
  getTransactionById,
} from '../../db/repositories/transactionRepo';
import { formatReadableDate } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { TransactionWithDetails } from '../../types';

export default function TransactionDetailScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tx, setTx] = useState<TransactionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const screenFocused = useRef(false);
  const deletePhase = useRef<'idle' | 'confirming' | 'deleting' | 'deleted'>('idle');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      screenFocused.current = true;
      setLoading(true);
      setLoadError(null);
      setIsDeleting(deletePhase.current === 'deleting');

      async function fetchTx() {
        try {
          const transactionId = Number(id);
          const item = Number.isSafeInteger(transactionId) && transactionId > 0
            ? await getTransactionById(transactionId)
            : null;
          if (active) setTx(item);
        } catch {
          if (active) {
            setTx(null);
            setLoadError('Gagal memuat detail transaksi. Silakan buka kembali halaman ini.');
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void fetchTx();
      return () => {
        active = false;
        screenFocused.current = false;
      };
    }, [id])
  );

  const handleDelete = () => {
    if (!tx || deletePhase.current !== 'idle') return;
    deletePhase.current = 'confirming';
    const dismissConfirmation = () => {
      if (deletePhase.current === 'confirming') deletePhase.current = 'idle';
    };

    Alert.alert(
      'Hapus Transaksi',
      'Apakah Anda yakin ingin menghapus transaksi ini? Saldo dompet akan disesuaikan kembali.',
      [
        { text: 'Batal', style: 'cancel', onPress: dismissConfirmation },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            if (deletePhase.current !== 'confirming' || !screenFocused.current) {
              dismissConfirmation();
              return;
            }
            deletePhase.current = 'deleting';
            setIsDeleting(true);
            try {
              await deleteTransaction(tx.id);
              deletePhase.current = 'deleted';
              if (screenFocused.current) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              }
            } catch (err: unknown) {
              deletePhase.current = 'idle';
              if (screenFocused.current) {
                Alert.alert('Gagal Menghapus', err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus transaksi.');
              }
            } finally {
              if (screenFocused.current) setIsDeleting(false);
            }
          },
        },
      ],
      { cancelable: true, onDismiss: dismissConfirmation }
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Memuat detail transaksi...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!tx) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>{loadError || 'Transaksi tidak ditemukan.'}</Text>
          <Button title="Kembali" onPress={() => router.back()} style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  const isIncome = tx.type === 'income';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} disabled={isDeleting} style={styles.backBtn}>
              <Icon name="chevLeft" size={20} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.screenTitle}>Detail Transaksi</Text>
            <Pressable onPress={handleDelete} disabled={isDeleting} style={styles.deleteBtn}>
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Amount Hero */}
          <View style={styles.amountCard}>
            <Text style={styles.typeLabel}>
              {isIncome ? 'Pemasukan' : 'Pengeluaran'}
            </Text>
            <AmountDisplay
              amount={tx.amount}
              type={isIncome ? 'income' : 'expense'}
              showSign
              size="hero"
              style={{ color: '#FFFFFF' }}
            />
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={styles.detailsCard}>
          {/* Category Row */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Kategori</Text>
            <View style={styles.rowRightBadge}>
              <View
                style={[
                  styles.catIconMini,
                  { backgroundColor: `${tx.category_color}20` },
                ]}
              >
                <Icon
                  name={tx.category_icon || 'other'}
                  size={16}
                  color={tx.category_color}
                />
              </View>
              <Text style={styles.rowValue}>{tx.category_name}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Wallet Row */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Dompet / Akun</Text>
            <Text style={styles.rowValue}>{tx.wallet_name}</Text>
          </View>

          <View style={styles.divider} />

          {/* Date Row */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Tanggal</Text>
            <Text style={styles.rowValue}>{formatReadableDate(tx.date)}</Text>
          </View>

          <View style={styles.divider} />

          {/* Note Row */}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Catatan</Text>
            <Text style={styles.rowValue}>{tx.note || '-'}</Text>
          </View>

          {/* Scan Result Indicator (if created by OCR scan) */}
          {tx.scan_result_id ? (
            <>
              <View style={styles.divider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Sumber Transaksi</Text>
                <View style={styles.scanBadge}>
                  <Icon name="scan" size={12} color={colors.success} strokeWidth={2} />
                  <Text style={styles.scanBadgeText}>Hasil Scan OCR On-Device</Text>
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* Delete action button */}
        <View style={styles.actionWrap}>
          <Button
            title="Edit Transaksi"
            variant="outline"
            disabled={isDeleting}
            onPress={() => router.push({ pathname: '/transaction/add', params: { id: String(tx.id) } })}
            style={{ marginBottom: 12 }}
          />
          <Button
            title="Hapus Transaksi Ini"
            variant="danger"
            onPress={handleDelete}
            loading={isDeleting}
            size="md"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.primaryDark,
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
    backgroundColor: colors.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 24,
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
  amountCard: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  typeLabel: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    marginBottom: 4,
  },
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -12,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 20,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 6,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  rowRightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catIconMini: {
    width: 28,
    height: 28,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  scanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  scanBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '600',
  },
  actionWrap: {
    marginTop: 10,
  },
});

