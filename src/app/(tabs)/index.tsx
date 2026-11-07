// src/app/(tabs)/index.tsx
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
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Colors, Radius, Typography } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import {
  getSummary,
  getTransactions,
} from '../../db/repositories/transactionRepo';
import { getTotalBalance } from '../../db/repositories/walletRepo';
import { formatReadableDate, getPeriodRange } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { Book, PeriodFilter, TransactionWithDetails } from '../../types';

const PERIODS: PeriodFilter[] = ['Harian', 'Mingguan', 'Bulanan', 'Tahunan'];

export default function HomeScreen() {
  const topInset = useTopInset(12);
  const [book, setBook] = useState<Book | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>('Bulanan');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [summary, setSummary] = useState<{ income: number; expense: number; total: number }>({
    income: 0,
    expense: 0,
    total: 0,
  });
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const activeBook = await getDefaultBook();
      if (!activeBook) return;
      setBook(activeBook);

      // 1. Total Balance across all wallets
      const balance = await getTotalBalance(activeBook.id);
      setTotalBalance(balance);

      // 2. Period Summary & Transactions
      const { startDate, endDate } = getPeriodRange(period, currentDate);
      const sum = await getSummary(activeBook.id, startDate, endDate);
      setSummary(sum);

      const txs = await getTransactions(activeBook.id, {
        startDate,
        endDate,
        limit: 100,
      });
      setTransactions(txs);
    } catch (err) {
      console.error('Failed to load home data:', err);
    }
  }, [period, currentDate]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handlePeriodChange = (p: PeriodFilter) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    setPeriod(p);
  };

  const navigateMonth = (direction: -1 | 1) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    const next = new Date(currentDate);
    if (period === 'Tahunan') {
      next.setFullYear(next.getFullYear() + direction);
    } else if (period === 'Bulanan') {
      next.setMonth(next.getMonth() + direction);
    } else if (period === 'Mingguan') {
      next.setDate(next.getDate() + direction * 7);
    } else {
      next.setDate(next.getDate() + direction);
    }
    setCurrentDate(next);
  };

  const getHeaderDateLabel = () => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    if (period === 'Tahunan') {
      return String(currentDate.getFullYear());
    }
    if (period === 'Bulanan') {
      return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (period === 'Harian') {
      return `${currentDate.getDate()} ${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      {/* Top Header Card */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.gradientStart, Colors.light.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          {/* Subtle Batik Kawung pattern */}
          <BatikPattern opacity={0.07} color="#FFFFFF" />

          {/* Top Row: Date Navigator & Book badge */}
          <View style={styles.topBar}>
            <View style={styles.dateNavigator}>
              <Pressable onPress={() => navigateMonth(-1)} style={styles.navArrow}>
                <Icon name="chevLeft" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.dateLabel}>{getHeaderDateLabel()}</Text>
              <Pressable onPress={() => navigateMonth(1)} style={styles.navArrow}>
                <Icon name="chevRight" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={styles.bookBadge}>
              <Icon name="wallet" size={13} color="#FFFFFF" />
              <Text style={styles.bookBadgeText}>{book?.name || 'Buku Utama'}</Text>
            </View>
          </View>

          {/* Period Selector Tabs */}
          <View style={styles.periodPillRow}>
            {PERIODS.map((p) => {
              const active = period === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => handlePeriodChange(p)}
                  style={[styles.periodPill, active && styles.periodPillActive]}
                >
                  <Text style={[styles.periodPillText, active && styles.periodPillTextActive]}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Balance & Income/Expense Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceSubtext}>Total Saldo Keseluruhan</Text>
            </View>
            <AmountDisplay
              amount={totalBalance}
              size="hero"
              style={styles.heroBalanceText}
            />

            <View style={styles.incomeExpenseRow}>
              {/* Income */}
              <View style={styles.flowItem}>
                <View style={[styles.flowIconBadge, styles.flowIncomeBadge]}>
                  <Icon name="arrowUp" size={14} color="#00C48C" strokeWidth={2.5} />
                </View>
                <View>
                  <Text style={styles.flowLabel}>Pemasukan</Text>
                  <AmountDisplay
                    amount={summary.income}
                    type="income"
                    size="md"
                    style={styles.flowValue}
                  />
                </View>
              </View>

              {/* Expense */}
              <View style={styles.flowItem}>
                <View style={[styles.flowIconBadge, styles.flowExpenseBadge]}>
                  <Icon name="arrowDown" size={14} color="#FF4757" strokeWidth={2.5} />
                </View>
                <View>
                  <Text style={styles.flowLabel}>Pengeluaran</Text>
                  <AmountDisplay
                    amount={summary.expense}
                    type="expense"
                    size="md"
                    style={styles.flowValue}
                  />
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Transactions List */}
      <View style={styles.contentBody}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>
          <Pressable
            onPress={() => router.push('/transaction/add' as any)}
            style={styles.addTxButton}
          >
            <Icon name="plus" size={15} color={Colors.light.primary} />
            <Text style={styles.addTxText}>Tambah</Text>
          </Pressable>
        </View>

        <FlatList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="wallet"
              title="Belum Ada Transaksi"
              subtitle="Catat pengeluaran atau pemasukan secara manual, atau scan struk belanja Anda."
              action={
                <Button
                  title="+ Catat Transaksi Baru"
                  size="sm"
                  onPress={() => router.push('/transaction/add' as any)}
                />
              }
            />
          }
          renderItem={({ item }) => {
            const isIncome = item.type === 'income';
            return (
              <Pressable
                onPress={() => router.push(`/transaction/${item.id}` as any)}
                style={({ pressed }) => [
                  styles.txItem,
                  pressed && styles.txItemPressed,
                ]}
              >
                <View
                  style={[
                    styles.txCategoryIcon,
                    { backgroundColor: `${item.category_color}18` },
                  ]}
                >
                  <Icon
                    name={item.category_icon || 'other'}
                    size={22}
                    color={item.category_color}
                  />
                </View>

                <View style={styles.txMainInfo}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {item.note || item.category_name}
                  </Text>
                  <Text style={styles.txSubtitle}>
                    {item.category_name} · {item.wallet_name} · {formatReadableDate(item.date)}
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bookBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  bookBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  periodPillRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: 16,
  },
  periodPill: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  periodPillActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  periodPillText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  periodPillTextActive: {
    color: Colors.light.primary,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  balanceHeader: {
    marginBottom: 2,
  },
  balanceSubtext: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    fontWeight: '400',
  },
  heroBalanceText: {
    color: '#FFFFFF',
    marginBottom: 14,
  },
  incomeExpenseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.14)',
  },
  flowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flowIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowIncomeBadge: {
    backgroundColor: 'rgba(0, 196, 140, 0.18)',
  },
  flowExpenseBadge: {
    backgroundColor: 'rgba(255, 71, 87, 0.18)',
  },
  flowLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
  },
  flowValue: {
    fontSize: 14,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: Typography.title.fontSize,
    fontWeight: Typography.title.fontWeight,
    color: Colors.light.text,
  },
  addTxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addTxText: {
    color: Colors.light.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  txItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  txItemPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.9,
  },
  txCategoryIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txMainInfo: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  txSubtitle: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
});

