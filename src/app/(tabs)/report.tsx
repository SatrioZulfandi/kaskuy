// src/app/(tabs)/report.tsx
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Colors, Radius, Typography } from '../../constants/theme';
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
import { formatMonthYear, getCurrentMonthString, getPeriodRange } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { BudgetWithProgress } from '../../types';

type ReportSubTab = 'Budget' | 'Pengeluaran' | 'Pemasukan' | 'Tren' | 'Evaluasi OCR';
const TABS: ReportSubTab[] = ['Budget', 'Pengeluaran', 'Pemasukan', 'Tren', 'Evaluasi OCR'];

export default function ReportScreen() {
  const topInset = useTopInset(12);
  const [activeTab, setActiveTab] = useState<ReportSubTab>('Budget');
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentMonthString());
  const [budgets, setBudgets] = useState<BudgetWithProgress[]>([]);
  const [budgetSummary, setBudgetSummary] = useState({ totalBudget: 0, totalSpent: 0, remaining: 0 });
  const [expenseBreakdown, setExpenseBreakdown] = useState<any[]>([]);
  const [incomeBreakdown, setIncomeBreakdown] = useState<any[]>([]);
  const [dailyTrends, setDailyTrends] = useState<any[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<any[]>([]);
  const [ocrStats, setOcrStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const book = await getDefaultBook();
      if (!book) return;

      // 1. Budget data (Dashboard 4)
      const bList = await getBudgetsWithProgress(book.id, currentMonth);
      setBudgets(bList);
      const bSum = await getBudgetSummary(book.id, currentMonth);
      setBudgetSummary(bSum);

      // Month date range
      const [year, month] = currentMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const pad = (n: number) => String(n).padStart(2, '0');
      const startDate = `${year}-${pad(month)}-01`;
      const endDate = `${year}-${pad(month)}-${pad(lastDay)}`;

      // 2. Category breakdowns (Dashboard 2 & 3)
      const exp = await getCategoryBreakdown(book.id, 'expense', startDate, endDate);
      setExpenseBreakdown(exp);

      const inc = await getCategoryBreakdown(book.id, 'income', startDate, endDate);
      setIncomeBreakdown(inc);

      // 3. Trends (Dashboard 5: last 7 days, Dashboard 6: last 6 months)
      const { startDate: dStart, endDate: dEnd } = getPeriodRange('Mingguan');
      const daily = await getDailyTrends(book.id, dStart, dEnd);
      setDailyTrends(daily);

      const monthly = await getMonthlyTrends(book.id, 6);
      setMonthlyTrends(monthly);

      // 4. OCR Evaluation Stats (Dashboard 8)
      const oStats = await getOcrEvaluationStats();
      setOcrStats(oStats);
    } catch (err) {
      console.error('Failed to load report data:', err);
    }
  }, [currentMonth]);

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
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setCurrentMonth(newMonth);
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
          {/* Month Navigator */}
          <View style={styles.topRow}>
            <View style={styles.dateNavigator}>
              <Pressable onPress={() => navigateMonth(-1)} style={styles.navArrow}>
                <Icon name="chevLeft" size={18} color="#FFFFFF" strokeWidth={2.2} />
              </Pressable>
              <Text style={styles.dateLabel}>{formatMonthYear(currentMonth)}</Text>
              <Pressable onPress={() => navigateMonth(1)} style={styles.navArrow}>
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
            <BatikPattern opacity={0.14} color="#FFFFFF" />
            <Text style={styles.summarySubtext}>
              {activeTab === 'Budget'
                ? 'Sisa Budget Bulan Ini'
                : activeTab === 'Pengeluaran'
                ? 'Total Pengeluaran Bulan Ini'
                : activeTab === 'Pemasukan'
                ? 'Total Pemasukan Bulan Ini'
                : activeTab === 'Evaluasi OCR'
                ? 'Akurasi Scan Struk On-Device'
                : 'Analisis Tren Keuangan'}
            </Text>
            <AmountDisplay
              amount={
                activeTab === 'Budget'
                  ? budgetSummary.remaining
                  : activeTab === 'Pengeluaran'
                  ? budgetSummary.totalSpent
                  : activeTab === 'Pemasukan'
                  ? incomeBreakdown.reduce((sum, i) => sum + i.total, 0)
                  : budgetSummary.remaining
              }
              size="hero"
              style={styles.summaryAmount}
            />
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.contentBody}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* TAB 1: BUDGET (Dashboard 4) */}
        {activeTab === 'Budget' && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Budget per Kategori</Text>
              <Pressable
                onPress={() => router.push('/budget/add' as any)}
                style={styles.linkButton}
              >
                <Icon name="plus" size={14} color={Colors.light.primary} />
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
                const isOver = b.percentage >= 100;
                const isNear = b.percentage >= 80 && !isOver;
                const barColor = isOver ? Colors.light.danger : isNear ? Colors.light.warning : b.category_color;

                return (
                  <View key={b.id} style={styles.budgetCard}>
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
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: PENGELUARAN (Dashboard 2) */}
        {activeTab === 'Pengeluaran' && (
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
                <View key={item.category_id} style={styles.breakdownCard}>
                  <View style={[styles.catIconWrap, { backgroundColor: `${item.category_color}18` }]}>
                    <Icon name={item.category_icon || 'other'} size={20} color={item.category_color} />
                  </View>
                  <View style={styles.breakdownDetails}>
                    <Text style={styles.breakdownTitle}>{item.category_name}</Text>
                    <Text style={styles.breakdownCount}>{item.count} transaksi</Text>
                  </View>
                  <AmountDisplay amount={item.total} type="expense" size="md" />
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: PEMASUKAN (Dashboard 3) */}
        {activeTab === 'Pemasukan' && (
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
                <View key={item.category_id} style={styles.breakdownCard}>
                  <View style={[styles.catIconWrap, { backgroundColor: `${item.category_color}18` }]}>
                    <Icon name={item.category_icon || 'salary'} size={20} color={item.category_color} />
                  </View>
                  <View style={styles.breakdownDetails}>
                    <Text style={styles.breakdownTitle}>{item.category_name}</Text>
                    <Text style={styles.breakdownCount}>{item.count} transaksi</Text>
                  </View>
                  <AmountDisplay amount={item.total} type="income" showSign size="md" />
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 4: TREN (Dashboard 5 & 6) */}
        {activeTab === 'Tren' && (
          <View style={styles.sectionWrap}>
            {/* Dashboard 5: Tren Harian */}
            <Text style={styles.sectionTitle}>Tren Harian (7 Hari Terakhir)</Text>
            <View style={styles.chartContainerCard}>
              {dailyTrends.length === 0 ? (
                <Text style={styles.emptyChartText}>Belum ada data 7 hari terakhir.</Text>
              ) : (
                <View style={styles.dailyTrendRow}>
                  {dailyTrends.map((d) => (
                    <View key={d.date} style={styles.dailyCol}>
                      <View style={styles.dailyBars}>
                        {d.income > 0 && (
                          <View
                            style={[
                              styles.dailyIncomeBar,
                              { height: Math.min(Math.max((d.income / 500000) * 60, 8), 70) },
                            ]}
                          />
                        )}
                        {d.expense > 0 && (
                          <View
                            style={[
                              styles.dailyExpenseBar,
                              { height: Math.min(Math.max((d.expense / 500000) * 60, 8), 70) },
                            ]}
                          />
                        )}
                      </View>
                      <Text style={styles.dailyLabel}>{d.date.slice(-2)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Dashboard 6: Tren Bulanan */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Tren Bulanan (6 Bulan Terakhir)</Text>
            <View style={styles.chartContainerCard}>
              {monthlyTrends.length === 0 ? (
                <Text style={styles.emptyChartText}>Belum ada data bulanan.</Text>
              ) : (
                monthlyTrends.map((m) => (
                  <View key={m.month} style={styles.monthlyRow}>
                    <Text style={styles.monthlyLabel}>{formatMonthYear(m.month)}</Text>
                    <View style={styles.monthlyValues}>
                      <Text style={styles.monthlyInc}>+{formatRupiah(m.income)}</Text>
                      <Text style={styles.monthlyExp}>-{formatRupiah(m.expense)}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* TAB 5: EVALUASI OCR (Dashboard 8: Luaran Riset) */}
        {activeTab === 'Evaluasi OCR' && (
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
                <Text style={[styles.statVal, { color: Colors.light.success }]}>
                  {ocrStats?.accuracyRate ?? 100}%
                </Text>
                <Text style={styles.statDesc}>Tingkat Akurasi</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statVal}>{ocrStats?.avgDurationMs ?? 0} ms</Text>
                <Text style={styles.statDesc}>Rata-rata Waktu OCR</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: Colors.light.warning }]}>
                  {ocrStats?.correctedCount ?? 0}
                </Text>
                <Text style={styles.statDesc}>Perlu Koreksi User</Text>
              </View>
            </View>

            <View style={styles.confidenceCard}>
              <Text style={styles.confidenceTitle}>Distribusi Keyakinan (Confidence)</Text>
              <View style={styles.confRow}>
                <View style={styles.confItem}>
                  <View style={[styles.confDot, { backgroundColor: Colors.light.success }]} />
                  <Text style={styles.confText}>Tinggi: {ocrStats?.highConfidence ?? 0}</Text>
                </View>
                <View style={styles.confItem}>
                  <View style={[styles.confDot, { backgroundColor: Colors.light.warning }]} />
                  <Text style={styles.confText}>Sedang: {ocrStats?.mediumConfidence ?? 0}</Text>
                </View>
                <View style={styles.confItem}>
                  <View style={[styles.confDot, { backgroundColor: Colors.light.danger }]} />
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
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
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
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -12,
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
    color: Colors.light.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.light.textMuted,
    lineHeight: 16,
    marginBottom: 8,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    color: Colors.light.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  budgetCard: {
    backgroundColor: '#FFFFFF',
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
    color: Colors.light.text,
  },
  budgetCatSub: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  budgetRightInfo: {
    alignItems: 'flex-end',
  },
  budgetRemaining: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.success,
  },
  budgetOver: {
    color: Colors.light.danger,
  },
  budgetPct: {
    fontSize: 11,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  breakdownCard: {
    backgroundColor: '#FFFFFF',
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
    color: Colors.light.text,
  },
  breakdownCount: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  chartContainerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
  },
  emptyChartText: {
    color: Colors.light.textMuted,
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
    backgroundColor: Colors.light.success,
  },
  dailyExpenseBar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.danger,
  },
  dailyLabel: {
    fontSize: 11,
    color: Colors.light.textMuted,
  },
  monthlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  monthlyLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.light.text,
  },
  monthlyValues: {
    alignItems: 'flex-end',
  },
  monthlyInc: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.success,
  },
  monthlyExp: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.danger,
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
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 14,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.primary,
    marginBottom: 4,
  },
  statDesc: {
    fontSize: 12,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  confidenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
    marginTop: 6,
  },
  confidenceTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
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
    color: Colors.light.textSecondary,
  },
});

