import { useTheme, useThemedStyles } from '../../hooks/use-theme';
// src/app/wallet/[id].tsx
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
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
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Typography, type ThemeColors } from '../../constants/theme';
import { useAppPreferences } from '../../contexts/AppPreferences';
import { getTransactions } from '../../db/repositories/transactionRepo';
import { deleteWallet, getWalletById, getWalletSummary, updateWallet } from '../../db/repositories/walletRepo';
import { formatReadableDate } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { TransactionWithDetails, Wallet } from '../../types';

const PAGE_SIZE = 50;

export default function WalletDetailScreen() {
  const colors = useTheme();
  const isDark = useAppPreferences().colorScheme === 'dark';
  const styles = useThemedStyles(isDark ? createDarkStyles : createLightStyles);
  const topInset = useTopInset(12);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [summary, setSummary] = useState({ count: 0, income: 0, expense: 0 });
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const pageBusy = useRef(false);
  const loadVersion = useRef(0);
  const screenFocused = useRef(false);
  const deletePhase = useRef<'idle' | 'confirming' | 'deleting' | 'deleted'>('idle');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadVersion.current++;
      screenFocused.current = true;
      pageBusy.current = false;
      setLoadingMore(false);
      setPageError(null);
      setLoading(true);
      setLoadError(null);
      setIsDeleting(deletePhase.current === 'deleting');

      async function loadData() {
        try {
          const walletId = Number(id);
          const w = Number.isSafeInteger(walletId) && walletId > 0
            ? await getWalletById(walletId)
            : null;
          const [list, stats] = w ? await Promise.all([
            getTransactions(w.book_id, { walletId: w.id, limit: PAGE_SIZE + 1 }),
            getWalletSummary(w.id),
          ]) : [[], { count: 0, income: 0, expense: 0 }];
          if (active) {
            setWallet(w);
            setTransactions(list.slice(0, PAGE_SIZE));
            setHasMore(list.length > PAGE_SIZE);
            setSummary(stats);
          }
        } catch {
          if (active) {
            setWallet(null);
            setTransactions([]);
            setLoadError('Gagal memuat detail dompet. Silakan buka kembali halaman ini.');
          }
        } finally {
          if (active) setLoading(false);
        }
      }

      void loadData();
      return () => {
        active = false;
        loadVersion.current++;
        screenFocused.current = false;
      };
    }, [id])
  );

  const loadMore = async () => {
    if (!wallet || pageBusy.current || !hasMore) return;
    pageBusy.current = true;
    const version = loadVersion.current;
    setLoadingMore(true);
    setPageError(null);
    try {
      const list = await getTransactions(wallet.book_id, {
        walletId: wallet.id,
        offset: transactions.length,
        limit: PAGE_SIZE + 1,
      });
      if (version !== loadVersion.current) return;
      setTransactions((current) => [...current, ...list.slice(0, PAGE_SIZE)]);
      setHasMore(list.length > PAGE_SIZE);
    } catch {
      if (version === loadVersion.current) setPageError('Riwayat berikutnya belum dapat dimuat. Silakan coba lagi.');
    } finally {
      if (version === loadVersion.current) {
        pageBusy.current = false;
        setLoadingMore(false);
      }
    }
  };

  const handleArchive = () => {
    if (!wallet || deletePhase.current !== 'idle') return;
    const archive = wallet.is_archived === 0;
    deletePhase.current = 'confirming';
    const cancel = () => { if (deletePhase.current === 'confirming') deletePhase.current = 'idle'; };
    Alert.alert(
      archive ? 'Arsipkan Dompet' : 'Aktifkan Kembali Dompet',
      archive
        ? 'Dompet akan disembunyikan dari pilihan transaksi baru dan total saldo aktif. Riwayat tetap tersedia.'
        : 'Dompet akan tersedia kembali untuk transaksi baru dan dihitung dalam total saldo aktif.',
      [
        { text: 'Batal', style: 'cancel', onPress: cancel },
        { text: archive ? 'Arsipkan' : 'Aktifkan', onPress: async () => {
          if (deletePhase.current !== 'confirming' || !screenFocused.current) { cancel(); return; }
          deletePhase.current = 'deleting';
          setIsDeleting(true);
          try {
            await updateWallet(wallet.id, { is_archived: archive ? 1 : 0 });
            if (screenFocused.current) {
              setWallet((current) => current ? { ...current, is_archived: archive ? 1 : 0 } : current);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          } catch (error: unknown) {
            if (screenFocused.current) Alert.alert('Gagal Mengubah Dompet', error instanceof Error ? error.message : 'Silakan coba lagi.');
          } finally {
            deletePhase.current = 'idle';
            if (screenFocused.current) setIsDeleting(false);
          }
        } },
      ],
      { cancelable: true, onDismiss: cancel }
    );
  };

  const handleDelete = () => {
    if (!wallet || deletePhase.current !== 'idle') return;
    deletePhase.current = 'confirming';
    const dismissConfirmation = () => {
      if (deletePhase.current === 'confirming') deletePhase.current = 'idle';
    };

    Alert.alert(
      'Hapus Dompet',
      'Hapus dompet ini? Dompet yang masih memiliki transaksi tidak dapat dihapus.',
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
              await deleteWallet(wallet.id);
              deletePhase.current = 'deleted';
              if (screenFocused.current) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.back();
              }
            } catch (err: unknown) {
              deletePhase.current = 'idle';
              if (screenFocused.current) {
                Alert.alert('Gagal Menghapus', err instanceof Error ? err.message : 'Terjadi kesalahan saat menghapus dompet.');
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
      <SafeAreaView style={[styles.safeArea, styles.loadingArea]}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Memuat detail dompet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!wallet) {
    return (
      <SafeAreaView style={[styles.safeArea, styles.loadingArea]}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>{loadError || 'Dompet tidak ditemukan.'}</Text>
          <Button title="Kembali" onPress={() => router.back()} style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      <View style={styles.headerContainer}>
        <LinearGradient
          variant="header"
          colors={[wallet.color || colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} disabled={isDeleting} style={styles.backBtn}>
              <Icon name="chevLeft" size={20} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
            <Text style={styles.screenTitle} numberOfLines={1}>{wallet.name}</Text>
            <Pressable onPress={handleDelete} disabled={isDeleting} style={styles.deleteBtn} accessibilityLabel="Hapus dompet">
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.balanceCard}>
            <BatikPattern opacity={isDark ? 0.06 : 0.07} color="#FFFFFF" />
            <View style={styles.balanceCaption}>
              {isDark && <Icon name={wallet.icon || 'wallet'} size={14} color={wallet.color || colors.selectionBackground} />}
              <Text style={styles.balanceSub}>{wallet.is_archived ? 'Saldo Dompet Arsip' : 'Saldo Saat Ini'}</Text>
            </View>
            <AmountDisplay
              amount={wallet.balance}
              size="hero"
              style={{ color: '#FFFFFF' }}
            />
          </View>
        </LinearGradient>
      </View>

      <View style={styles.contentBody}>
        <FlatList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.summaryWrap}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCell}>
                  <Text style={styles.statLabel}>Pemasukan</Text>
                  <AmountDisplay amount={summary.income} type="income" size="sm" />
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.statLabel}>Pengeluaran</Text>
                  <AmountDisplay amount={summary.expense} type="expense" size="sm" />
                </View>
              </View>
              <View style={styles.actionRow}>
                <Button title="Edit Dompet" size="sm" variant="outline" disabled={isDeleting}
                  onPress={() => router.push({ pathname: '/wallet/add', params: { id: String(wallet.id) } })} />
                <Button title={wallet.is_archived ? 'Aktifkan Kembali' : 'Arsipkan'} size="sm" variant="secondary"
                  loading={isDeleting} onPress={handleArchive} />
              </View>
              <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>
              <Text style={styles.statLabel}>{summary.count} transaksi · {transactions.length} ditampilkan</Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.pageFooter}>
              {pageError ? <Text style={styles.statLabel}>{pageError}</Text> : null}
              {hasMore ? <Button title={pageError ? 'Coba Lagi' : 'Muat Lebih Banyak'} variant="outline" size="sm"
                loading={loadingMore} onPress={() => { void loadMore(); }} /> : null}
            </View>
          }
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

const createLightStyles = (colors: ThemeColors) => createStyles(colors, false);
const createDarkStyles = (colors: ThemeColors) => createStyles(colors, true);

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: isDark ? colors.gradientStart : colors.primaryDark,
  },
  loadingArea: {
    backgroundColor: isDark ? colors.background : colors.primaryDark,
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
    backgroundColor: isDark ? colors.gradientEnd : colors.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: isDark ? Radius.xl + 10 : 22,
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
    flex: 1,
    marginHorizontal: 12,
    textAlign: 'center',
    fontSize: Typography.header.fontSize,
    fontWeight: Typography.header.fontWeight,
    color: '#FFFFFF',
  },
  balanceCard: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.18)',
    position: 'relative',
    overflow: 'hidden',
  },
  balanceCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  balanceSub: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
  },
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: isDark ? -Radius.xl : -12,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: Typography.title.fontSize,
    fontWeight: Typography.title.fontWeight,
    color: colors.text,
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  summaryWrap: {
    gap: 12,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCell: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    padding: 12,
    gap: 6,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pageFooter: {
    gap: 10,
    paddingVertical: 12,
  },
  txCard: {
    backgroundColor: colors.surface,
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
    color: colors.text,
    marginBottom: 2,
  },
  txSub: {
    fontSize: 12,
    color: isDark ? colors.textSecondary : colors.textMuted,
  },
});

