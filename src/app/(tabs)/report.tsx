import { useTheme, useThemedStyles } from '../../hooks/use-theme';
// src/app/(tabs)/report.tsx
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
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
import { getDefaultBook } from '../../db/repositories/bookRepo';
import {
  getBudgetSummary,
  getBudgetsWithProgress,
} from '../../db/repositories/budgetRepo';
import { getOcrEvaluationStats } from '../../db/repositories/scanResultRepo';
import {
  getCategoryBreakdown,
  getDailyTrends,
  getMonthlyTrends,
} from '../../db/repositories/transactionRepo';
import { formatRupiah } from '../../lib/currency';
import { formatMonthYear, formatReadableDate, getCurrentMonthString, getMonthRange, getPeriodRange, getTodayDateString } from '../../lib/date';
import { getTrendBarHeight } from '../../lib/trends';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { BudgetWithProgress } from '../../types';

type ReportSubTab = 'Budget' | 'Pengeluaran' | 'Pemasukan' | 'Tren' | 'Evaluasi OCR';
const TABS: ReportSubTab[] = ['Budget', 'Pengeluaran', 'Pemasukan', 'Tren', 'Evaluasi OCR'];

export default function ReportScreen() {
  const colors = useTheme();
  const isDark = useAppPreferences().colorScheme === 'dark';
  const styles = useThemedStyles(isDark ? createDarkStyles : createLightStyles);
  const topInset = useTopInset(12);
  const [activeTab, setActiveTab] = useState<ReportSubTab>('Budget');
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonthString());
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [budgetSummary, setBudgetSummary] = useState({ totalBudget: 0, totalSpent: 0, remaining: 0 });
  const [expenseBreakdown, setExpenseBreakdown] = useState<Awaited<ReturnType<typeof getCategoryBreakdown>>>([]);
  const [incomeBreakdown, setIncomeBreakdown] = useState<Awaited<ReturnType<typeof getCategoryBreakdown>>>([]);
  const [dailyTrends, setDailyTrends] = useState<Awaited<ReturnType<typeof getDailyTrends>>>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<Awaited<ReturnType<typeof getMonthlyTrends>>>([]);
  const [ocrStats, setOcrStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const [trendYear, trendMonth] = currentMonth.split('-').map(Number);
  const trendAnchor = currentMonth === getCurrentMonthString() ? new Date() : new Date(trendYear, trendMonth, 0);
  const { startDate: dailyStartDate, endDate: dailyEndDate } = getPeriodRange('Mingguan', trendAnchor);
  const dailyMaximum = Math.max(0, ...dailyTrends.map((day) => Math.max(day.income, day.expense)));
  const monthlyMaximum = Math.max(0, ...monthlyTrends.map((month) => Math.max(month.income, month.expense)));
  const expenseTotal = expenseBreakdown.reduce((sum, item) => sum + item.total, 0);
  const incomeTotal = incomeBreakdown.reduce((sum, item) => sum + item.total, 0);
  const openTransactions = (options: { title: string; startDate?: string; endDate?: string; categoryId?: number; type?: 'income' | 'expense' }) => {
    router.push({ pathname: '/transaction/list', params: { ...getMonthRange(currentMonth), ...options } });
  };

  const loadData = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setLoadError(null);
    try {
      const book = await getDefaultBook();
      if (version !== loadVersion.current) return;
      if (!book) throw new Error('Buku keuangan tidak ditemukan.');
      const { startDate, endDate } = getMonthRange(currentMonth);
      const [bList, bSum, exp, inc, daily, monthly, oStats] = await Promise.all([
        getBudgetsWithProgress(book.id, currentMonth),
        getBudgetSummary(book.id, currentMonth),
        getCategoryBreakdown(book.id, 'expense', startDate, endDate),
        getCategoryBreakdown(book.id, 'income', startDate, endDate),
        getDailyTrends(book.id, dailyStartDate, dailyEndDate),
        getMonthlyTrends(book.id, 6, currentMonth),
        getOcrEvaluationStats(),
      ]);
      if (version !== loadVersion.current) return;
      setBudgets(bList);
      setBudgetSummary(bSum);
      setExpenseBreakdown(exp);
      setIncomeBreakdown(inc);
      setDailyTrends(daily);
      setMonthlyTrends(monthly);
      setOcrStats(oStats);
    } catch {
      if (version === loadVersion.current) setLoadError('Gagal memuat laporan. Silakan coba lagi.');
    } finally {
      if (version === loadVersion.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [currentMonth, dailyStartDate, dailyEndDate]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      return () => { loadVersion.current++; };
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleTabChange = (t: ReportSubTab) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    setActiveTab(t);
  };

  const navigateMonth = (direction: -1 | 1) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    loadVersion.current++;
    setLoading(true);
    setCurrentMonth((month) => {
      const [year, monthNumber] = month.split('-').map(Number);
      const date = new Date(year, monthNumber - 1 + direction, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      <View style={styles.headerContainer}>
        <LinearGradient
          variant="header"
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          {/* Month Navigator */}
          <View style={styles.topRow}>
            <View style={styles.dateNavigator}>
              <Pressable onPress={() => navigateMonth(-1)} style={styles.navArrow} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Bulan sebelumnya">
                <Icon name="chevLeft" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.dateLabel}>{formatMonthYear(currentMonth)}</Text>
              <Pressable onPress={() => navigateMonth(1)} style={styles.navArrow} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Bulan berikutnya">
                <Icon name="chevRight" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </Pressable>
            </View>

            <Text style={styles.headerTitle}>Laporan & Analisis</Text>
          </View>

          {/* Sub-tabs scrollable */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {TABS.map((t) => {
              const active = activeTab === t;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="tab"
                  accessibilityLabel={t}
                  accessibilityState={{ selected: active }}
                  onPress={() => handleTabChange(t)}
                  style={[styles.subTabPill, active && styles.subTabPillActive]}
                >
                  <Text style={[styles.subTabPillText, active && styles.subTabPillTextActive]}>
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Sisa Budget / Hero overview */}
          <View style={styles.summaryCard}>
            <BatikPattern opacity={isDark ? 0.06 : 0.07} color="#FFFFFF" />
            <Text style={styles.summarySubtext}>
              {activeTab === 'Budget'
                ? 'Sisa Budget Bulan Terpilih'
                : activeTab === 'Pengeluaran'
                ? 'Total Pengeluaran Bulan Terpilih'
                : activeTab === 'Pemasukan'
                ? 'Total Pemasukan Bulan Terpilih'
                : activeTab === 'Evaluasi OCR'
                ? 'Akurasi Scan Struk On-Device'
                : 'Analisis Tren Keuangan'}
            </Text>
            {loading || loadError ? (
              <Text style={styles.summarySubtext}>{loading ? 'Memuat ringkasan...' : 'Ringkasan belum dapat dimuat.'}</Text>
            ) : (
              <AmountDisplay
                amount={
                  activeTab === 'Budget'
                    ? budgetSummary.remaining
                    : activeTab === 'Pengeluaran'
                    ? expenseTotal
                    : activeTab === 'Pemasukan'
                    ? incomeTotal
                    : budgetSummary.remaining
                }
                size="hero"
                style={styles.summaryAmount}
              />
            )}
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.contentBody}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <Text style={styles.sectionSubtitle}>Memuat laporan...</Text>
        ) : loadError ? (
          <EmptyState
            icon="chart"
            title="Laporan Belum Dapat Dimuat"
            subtitle={loadError}
            action={<Button title="Coba Lagi" size="sm" onPress={() => { void loadData(); }} />}
          />
        ) : null}
        {/* TAB 1: BUDGET (Dashboard 4) */}
        {!loading && !loadError && activeTab === 'Budget' && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Budget per Kategori</Text>
              <Pressable
                onPress={() => router.push({ pathname: '/budget/add', params: { month: currentMonth } })}
                style={styles.linkButton}
              >
                <Icon name="plus" size={14} color={colors.primary} />
                <Text style={styles.linkText}>Tambah Budget</Text>
              </Pressable>
            </View>

            {budgets.length === 0 ? (
              <EmptyState
                icon="chart"
                title="Belum Ada Budget"
                subtitle="Tetapkan batas pengeluaran bulanan per kategori untuk mengontrol keuangan Anda."
              />
            ) : (
              budgets.map((b) => {
                const isOver = b.spent > b.amount;
                const isExhausted = b.spent >= b.amount;
                const isNear = b.spent >= b.amount * 0.9 && !isExhausted;
                const barColor = isExhausted ? colors.danger : isNear ? colors.warning : b.category_color;

                return (
                  <Pressable key={b.id} style={styles.budgetCard} accessibilityRole="button" accessibilityLabel={`Ubah budget ${b.category_name}`} onPress={() => router.push({ pathname: '/budget/add', params: { id: b.id } })}>
                    <View style={styles.budgetCardHeader}>
                      <View style={[styles.catIconWrap, { backgroundColor: `${b.category_color}18` }]}>
                        <Icon name={b.category_icon || 'other'} size={20} color={b.category_color} />
                      </View>
                      <View style={styles.budgetCatInfo}>
                        <Text style={styles.budgetCatName}>{b.category_name}</Text>
                        <Text style={styles.budgetCatSub}>
                          {formatRupiah(b.spent)} / {formatRupiah(b.amount)}
                        </Text>
                      </View>
                      <View style={styles.budgetRightInfo}>
                        <Text style={[styles.budgetRemaining, isOver && styles.budgetOver]}>
                          {isOver ? 'Lebih ' : 'Sisa '}
                          {formatRupiah(Math.abs(b.remaining))}
                        </Text>
                        <Text style={styles.budgetPct}>{b.percentage}%</Text>
                      </View>
                    </View>
                    {b.spent >= b.amount * 0.9 && <Text style={{ color: isExhausted ? colors.danger : colors.warning, fontSize: 12 }}>
                      {isExhausted ? 'Budget sudah habis atau terlampaui.' : 'Budget hampir habis. Tinjau pengeluaran Anda.'}
                    </Text>}
                    <Text style={styles.budgetCatSub}>Ketuk untuk ubah atau hapus budget</Text>

                    {/* Progress Bar */}
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(b.percentage, 100)}%`,
                            backgroundColor: barColor,
                          },
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: PENGELUARAN (Dashboard 2) */}
        {!loading && !loadError && activeTab === 'Pengeluaran' && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Breakdown Pengeluaran per Kategori</Text>
            {expenseBreakdown.length === 0 ? (
              <EmptyState
                icon="chart"
                title="Tidak Ada Pengeluaran"
                subtitle="Belum ada transaksi pengeluaran tercatat pada bulan ini."
              />
            ) : (
              expenseBreakdown.map((item) => (
                <Pressable key={item.category_id} style={styles.breakdownCard} accessibilityRole="button" onPress={() => openTransactions({ title: item.category_name, categoryId: item.category_id, type: 'expense' })}>
                  <View style={[styles.catIconWrap, { backgroundColor: `${item.category_color}18` }]}>
                    <Icon name={item.category_icon || 'other'} size={20} color={item.category_color} />
                  </View>
                  <View style={styles.breakdownDetails}>
                    <Text style={styles.breakdownTitle}>{item.category_name}</Text>
                    <Text style={styles.breakdownCount}>{item.count} transaksi · {expenseTotal ? Math.round(item.total / expenseTotal * 100) : 0}%</Text>
                    <View style={[styles.progressBarTrack, { marginTop: 8 }]}><View style={[styles.progressBarFill, { width: `${expenseTotal ? item.total / expenseTotal * 100 : 0}%`, backgroundColor: item.category_color }]} /></View>
                  </View>
                  <AmountDisplay amount={item.total} type="expense" size="md" />
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* TAB 3: PEMASUKAN (Dashboard 3) */}
        {!loading && !loadError && activeTab === 'Pemasukan' && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Breakdown Pemasukan per Kategori</Text>
            {incomeBreakdown.length === 0 ? (
              <EmptyState
                icon="salary"
                title="Tidak Ada Pemasukan"
                subtitle="Belum ada transaksi pemasukan tercatat pada bulan ini."
              />
            ) : (
              incomeBreakdown.map((item) => (
                <Pressable key={item.category_id} style={styles.breakdownCard} accessibilityRole="button" onPress={() => openTransactions({ title: item.category_name, categoryId: item.category_id, type: 'income' })}>
                  <View style={[styles.catIconWrap, { backgroundColor: `${item.category_color}18` }]}>
                    <Icon name={item.category_icon || 'salary'} size={20} color={item.category_color} />
                  </View>
                  <View style={styles.breakdownDetails}>
                    <Text style={styles.breakdownTitle}>{item.category_name}</Text>
                    <Text style={styles.breakdownCount}>{item.count} transaksi · {incomeTotal ? Math.round(item.total / incomeTotal * 100) : 0}%</Text>
                    <View style={[styles.progressBarTrack, { marginTop: 8 }]}><View style={[styles.progressBarFill, { width: `${incomeTotal ? item.total / incomeTotal * 100 : 0}%`, backgroundColor: item.category_color }]} /></View>
                  </View>
                  <AmountDisplay amount={item.total} type="income" showSign size="md" />
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* TAB 4: TREN (Dashboard 5 & 6) */}
        {!loading && !loadError && activeTab === 'Tren' && (
          <View style={styles.sectionWrap}>
            {/* Dashboard 5: Tren Harian */}
            <Text style={styles.sectionTitle}>Tren Harian (7 Hari)</Text>
            <Text style={styles.sectionSubtitle}>
              {formatReadableDate(dailyStartDate)} – {formatReadableDate(dailyEndDate)}
            </Text>
            <View style={styles.chartContainerCard}>
              {dailyTrends.length === 0 ? (
                <Text style={styles.emptyChartText}>Belum ada data 7 hari terakhir.</Text>
              ) : (
                <View style={styles.dailyTrendRow}>
                  {dailyTrends.map((d) => (
                    <Pressable
                      key={d.date}
                      style={styles.dailyCol}
                      accessibilityRole="button"
                      onPress={() => openTransactions({ title: formatReadableDate(d.date), startDate: d.date, endDate: d.date })}
                      accessible
                      accessibilityLabel={`${formatReadableDate(d.date)}, pemasukan ${formatRupiah(d.income)}, pengeluaran ${formatRupiah(d.expense)}`}
                    >
                      <View style={styles.dailyBars}>
                        {d.income > 0 && (
                          <View
                            style={[
                              styles.dailyIncomeBar,
                              { height: getTrendBarHeight(d.income, dailyMaximum) },
                            ]}
                          />
                        )}
                        {d.expense > 0 && (
                          <View
                            style={[
                              styles.dailyExpenseBar,
                              { height: getTrendBarHeight(d.expense, dailyMaximum) },
                            ]}
                          />
                        )}
                      </View>
                      <Text style={[styles.dailyLabel, d.date === getTodayDateString() && { color: colors.primary, fontWeight: '700' }]}>{d.date.slice(-2)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.chartLegend}>
                <Text style={styles.monthlyInc}>Pemasukan</Text>
                <Text style={styles.monthlyExp}>Pengeluaran</Text>
              </View>
              <Text style={[styles.sectionSubtitle, { marginTop: 10 }]}>Skala tertinggi {formatRupiah(dailyMaximum)}. Ketuk hari untuk detail.</Text>
            </View>

            {/* Dashboard 6: Tren Bulanan */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Tren Bulanan (6 Bulan)</Text>
            <Text style={styles.sectionSubtitle}>Sampai dengan {formatMonthYear(currentMonth)}</Text>
            <View style={styles.chartContainerCard}>
              {monthlyTrends.length === 0 ? (
                <Text style={styles.emptyChartText}>Belum ada data bulanan.</Text>
              ) : (
                monthlyTrends.map((m) => (
                  <Pressable key={m.month} style={[styles.monthlyRow, { alignItems: 'center', gap: 10 }]} accessibilityRole="button" onPress={() => openTransactions({ title: formatMonthYear(m.month), ...getMonthRange(m.month) })}>
                    <Text style={styles.monthlyLabel}>{formatMonthYear(m.month)}</Text>
                    <View style={{ flex: 1, gap: 6 }}>
                      <View style={[styles.progressBarTrack, { height: 8 }]}><View style={{ height: 8, backgroundColor: colors.success, width: `${monthlyMaximum ? m.income / monthlyMaximum * 100 : 0}%` }} /></View>
                      <View style={[styles.progressBarTrack, { height: 8 }]}><View style={{ height: 8, backgroundColor: colors.danger, width: `${monthlyMaximum ? m.expense / monthlyMaximum * 100 : 0}%` }} /></View>
                    </View>
                    <View style={styles.monthlyValues}>
                      <Text style={styles.monthlyInc}>+{formatRupiah(m.income)}</Text>
                      <Text style={styles.monthlyExp}>-{formatRupiah(m.expense)}</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        )}

        {/* TAB 5: EVALUASI OCR (Dashboard 8: Luaran Riset) */}
        {!loading && !loadError && activeTab === 'Evaluasi OCR' && (
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle}>Statistik Riset OCR Struk On-Device</Text>
            <Text style={styles.sectionSubtitle}>
              Data evaluasi akurasi ekstraksi struk offline via Levenshtein Distance & validasi aritmetika.
            </Text>

            <View style={styles.ocrStatsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{ocrStats?.totalScans ?? 0}</Text>
                <Text style={styles.statDesc}>Total Struk Di-scan</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: colors.success }]}>
                  {ocrStats?.accuracyRate ?? 100}%
                </Text>
                <Text style={styles.statDesc}>Tingkat Akurasi</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statVal}>{ocrStats?.avgDurationMs ?? 0} ms</Text>
                <Text style={styles.statDesc}>Rata-rata Waktu OCR</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: colors.warning }]}>
                  {ocrStats?.correctedCount ?? 0}
                </Text>
                <Text style={styles.statDesc}>Perlu Koreksi User</Text>
              </View>
            </View>

            <View style={styles.confidenceCard}>
              <Text style={styles.confidenceTitle}>Distribusi Keyakinan (Confidence)</Text>
              <View style={styles.confRow}>
                <View style={styles.confItem}>
                  <View style={[styles.confDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.confText}>Tinggi: {ocrStats?.highConfidence ?? 0}</Text>
                </View>
                <View style={styles.confItem}>
                  <View style={[styles.confDot, { backgroundColor: colors.warning }]} />
                  <Text style={styles.confText}>Sedang: {ocrStats?.mediumConfidence ?? 0}</Text>
                </View>
                <View style={styles.confItem}>
                  <View style={[styles.confDot, { backgroundColor: colors.danger }]} />
                  <Text style={styles.confText}>Rendah: {ocrStats?.lowConfidence ?? 0}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
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
  headerContainer: {
    backgroundColor: isDark ? colors.gradientEnd : colors.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: isDark ? Radius.xl + 10 : 22,
    position: 'relative',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  tabScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 16,
  },
  subTabPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  subTabPillActive: {
    backgroundColor: isDark ? colors.selectionBackground : '#FFFFFF',
  },
  subTabPillText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
  },
  subTabPillTextActive: {
    color: isDark ? colors.selectionText : colors.primaryDark,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.18)',
    position: 'relative',
    overflow: 'hidden',
  },
  summarySubtext: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    marginBottom: 4,
  },
  summaryAmount: {
    color: '#FFFFFF',
  },
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: isDark ? -Radius.xl : -12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
  },
  sectionWrap: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: Typography.title.fontSize,
    fontWeight: Typography.title.fontWeight,
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: isDark ? colors.textSecondary : colors.textMuted,
    lineHeight: 16,
    marginBottom: 8,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  budgetCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 12,
  },
  budgetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  catIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetCatInfo: {
    flex: 1,
  },
  budgetCatName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  budgetCatSub: {
    fontSize: 12,
    color: isDark ? colors.textSecondary : colors.textMuted,
    marginTop: 2,
  },
  budgetRightInfo: {
    alignItems: 'flex-end',
  },
  budgetRemaining: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
  },
  budgetOver: {
    color: colors.danger,
  },
  budgetPct: {
    fontSize: 11,
    color: isDark ? colors.textSecondary : colors.textMuted,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: isDark ? colors.surfaceElevated : colors.borderLight,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breakdownDetails: {
    flex: 1,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  breakdownCount: {
    fontSize: 12,
    color: isDark ? colors.textSecondary : colors.textMuted,
    marginTop: 2,
  },
  chartContainerCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: 16,
  },
  emptyChartText: {
    color: isDark ? colors.textSecondary : colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  dailyTrendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 90,
    paddingTop: 10,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 14,
  },
  dailyCol: {
    alignItems: 'center',
    gap: 6,
  },
  dailyBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 70,
  },
  dailyIncomeBar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  dailyExpenseBar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  dailyLabel: {
    fontSize: 11,
    color: isDark ? colors.textSecondary : colors.textMuted,
  },
  monthlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  monthlyLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  monthlyValues: {
    alignItems: 'flex-end',
  },
  monthlyInc: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
  },
  monthlyExp: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  ocrStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 6,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: 14,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },
  statDesc: {
    fontSize: 12,
    color: isDark ? colors.textSecondary : colors.textMuted,
    textAlign: 'center',
  },
  confidenceCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: 16,
    marginTop: 6,
  },
  confidenceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 10,
  },
  confRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  confItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  confText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

