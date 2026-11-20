import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Spacing, Typography, type ThemeColors } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { createTransaction, getTransactionById, updateTransaction } from '../../db/repositories/transactionRepo';
import { getWallets } from '../../db/repositories/walletRepo';
import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { useTopInset } from '../../hooks/useTopInset';
import { formatRupiah } from '../../lib/currency';
import { getTodayDateString, isValidDateString } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import type { Category, TransactionType, Wallet } from '../../types';

const KEYPAD_KEYS = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '000', '0', '⌫',
];

type FormField = 'amount' | 'date' | 'wallet' | 'category';
type CategoryStatus = 'loading' | 'ready' | 'error';

export default function AddTransactionScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const isEditing = params.id !== undefined;
  const formKey = params.id ?? `new:${params.type ?? 'expense'}`;
  const [type, setType] = useState<TransactionType>(
    params.type === 'income' ? 'income' : 'expense'
  );
  const [amountStr, setAmountStr] = useState<string>('0');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryStatus, setCategoryStatus] = useState<CategoryStatus>('loading');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(getTodayDateString());
  const [note, setNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [bookId, setBookId] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loading = loadedKey !== formKey;
  const ready = !loading && !loadError;
  const saving = useRef(false);
  const screenFocused = useRef(false);
  const scrollView = useRef<ScrollView>(null);
  const noteInput = useRef<TextInput>(null);
  const fieldPositions = useRef<Partial<Record<FormField, number>>>({});
  const amount = Number(amountStr);
  const amountValid = Number.isSafeInteger(amount) && amount > 0;
  const dateValid = isValidDateString(date);
  const wallet = wallets.find((option) => option.id === selectedWalletId);
  const category = categories.find((option) => option.id === selectedCategoryId && option.type === type);

  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    return () => { screenFocused.current = false; };
  }, []));

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const id = Number(params.id);
        if (isEditing && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Transaksi tidak ditemukan.');
        const existing = isEditing ? await getTransactionById(id) : null;
        if (isEditing && !existing) throw new Error('Transaksi tidak ditemukan.');
        const book = existing ? { id: existing.book_id } : await getDefaultBook();
        if (!book) throw new Error('Buku keuangan tidak ditemukan.');
        const initialType = existing?.type ?? (params.type === 'income' ? 'income' : 'expense');
        const [allWallets, cList] = await Promise.all([getWallets(book.id, isEditing), getCategories(initialType)]);
        const wList = allWallets.filter((wallet) => wallet.is_archived === 0 || wallet.id === existing?.wallet_id);
        if (!active) return;
        setLoadError(null);
        setSaveError(null);
        setShowValidation(false);
        setBookId(book.id);
        setType(initialType);
        setWallets(wList);
        setSelectedWalletId(existing?.wallet_id ?? wList[0]?.id ?? null);
        setCategories(cList);
        setCategoryStatus('ready');
        setSelectedCategoryId(existing?.category_id ?? cList[0]?.id ?? null);
        setAmountStr(String(existing?.amount ?? 0));
        setDate(existing?.date ?? getTodayDateString());
        setNote(existing?.note ?? '');
      } catch (error: unknown) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Gagal memuat transaksi.');
      } finally {
        if (active) setLoadedKey(formKey);
      }
    }
    void loadData();
    return () => { active = false; };
  }, [formKey, isEditing, loadAttempt, params.id, params.type]);

  useEffect(() => {
    if (!ready || categoryStatus !== 'loading') return;
    let active = true;
    const loadCategories = async () => {
      try {
        const list = await getCategories(type);
        if (!active) return;
        setCategories(list);
        setSelectedCategoryId(list[0]?.id ?? null);
        setCategoryStatus('ready');
      } catch {
        if (active) setCategoryStatus('error');
      }
    };
    void loadCategories();
    return () => { active = false; };
  }, [categoryStatus, ready, type]);

  const handleTypeChange = (nextType: TransactionType) => {
    if (!ready || saving.current || nextType === type) return;
    setType(nextType);
    setSelectedCategoryId(null);
    setCategories([]);
    setCategoryStatus('loading');
    if (!isEditing) setAmountStr('0');
  };

  const handleKeypadPress = (key: string) => {
    if (saving.current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAmountStr((current) => {
      if (key === '⌫') return current.slice(0, -1) || '0';
      if (current === '0') return key === '000' ? '0' : key;
      const nextAmount = current + key;
      return Number.isSafeInteger(Number(nextAmount)) ? nextAmount : current;
    });
  };

  const handleSave = async () => {
    if (!screenFocused.current || saving.current || !ready || bookId === null || categoryStatus === 'loading') return;
    Keyboard.dismiss();
    setSaveError(null);
    if (!amountValid || !dateValid || !wallet || !category) {
      setShowValidation(true);
      const firstInvalid: FormField = !amountValid ? 'amount' : !dateValid ? 'date' : !wallet ? 'wallet' : 'category';
      const position = fieldPositions.current[firstInvalid] ?? 0;
      scrollView.current?.scrollTo({ y: Math.max(0, position - Spacing.lg), animated: true });
      return;
    }

    saving.current = true;
    setIsSaving(true);
    let saved = false;
    try {
      const values = {
        wallet_id: wallet.id,
        category_id: category.id,
        type,
        amount,
        note: note.trim() || null,
        date,
      };
      if (isEditing) await updateTransaction(Number(params.id), values);
      else await createTransaction({ ...values, book_id: bookId });

      saved = true;
      if (screenFocused.current) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch (error: unknown) {
      if (screenFocused.current) {
        setSaveError(error instanceof Error ? error.message : 'Coba simpan kembali.');
      }
    } finally {
      if (!saved) saving.current = false;
      if (screenFocused.current) setIsSaving(false);
    }
  };

  const isExpense = type === 'expense';

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tutup formulir transaksi"
              onPress={() => router.back()}
              disabled={isSaving}
              style={styles.headerButton}
              hitSlop={Spacing.xs}
            >
              <Icon name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text accessibilityRole="header" style={styles.screenTitle}>
              {isEditing ? 'Edit Transaksi' : 'Tambah Transaksi'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scan struk"
              disabled={isSaving}
              onPress={() => router.push('/scan')}
              style={styles.headerButton}
              hitSlop={Spacing.xs}
            >
              <Icon name="scan" size={18} color="#FFFFFF" strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.toggleRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isExpense }}
              disabled={!ready || isSaving}
              onPress={() => handleTypeChange('expense')}
              style={[styles.toggleBtn, isExpense && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, isExpense && styles.toggleTextActiveExp]}>
                Pengeluaran
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !isExpense }}
              disabled={!ready || isSaving}
              onPress={() => handleTypeChange('income')}
              style={[styles.toggleBtn, !isExpense && styles.toggleBtnActive]}
            >
              <Text style={[styles.toggleText, !isExpense && styles.toggleTextActiveInc]}>
                Pemasukan
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        ref={scrollView}
        style={styles.contentBody}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onLayout={() => {
          if (noteInput.current?.isFocused()) scrollView.current?.scrollToEnd({ animated: true });
        }}
      >
        {loading || loadError ? (
          <View style={styles.loadPanel}>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text accessibilityLiveRegion="polite" style={styles.helperText}>Memuat transaksi…</Text>
              </View>
            ) : (
              <>
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>{loadError}</Text>
                <Button
                  title="Coba Lagi"
                  variant="outline"
                  onPress={() => {
                    setLoadedKey(null);
                    setLoadAttempt((attempt) => attempt + 1);
                  }}
                />
              </>
            )}
          </View>
        ) : (
          <>
            <View
              style={styles.sectionItem}
              onLayout={({ nativeEvent }) => { fieldPositions.current.amount = nativeEvent.layout.y; }}
            >
              <Text accessibilityRole="header" style={styles.sectionLabel}>Nominal</Text>
              <View style={[
                styles.amountCard,
                showValidation && !amountValid && styles.invalidAmountCard,
              ]}>
                <View style={styles.amountWrap}>
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.55}
                    numberOfLines={1}
                    style={[styles.amountText, { color: isExpense ? colors.danger : colors.success }]}
                  >
                    {formatRupiah(amount)}
                  </Text>
                  {showValidation && !amountValid && (
                    <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                      Masukkan nominal lebih dari Rp0.
                    </Text>
                  )}
                </View>
                <View style={styles.keypadGrid}>
                  {KEYPAD_KEYS.map((key) => (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={key === '⌫' ? 'Hapus digit terakhir' : key === '000' ? 'Tiga nol' : key}
                      disabled={isSaving}
                      onPress={() => handleKeypadPress(key)}
                      style={({ pressed }) => [styles.keypadKey, pressed && styles.keypadKeyPressed]}
                    >
                      <Text style={[styles.keypadKeyText, key === '⌫' && { color: colors.danger }]}>{key}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View
              style={styles.sectionItem}
              onLayout={({ nativeEvent }) => { fieldPositions.current.date = nativeEvent.layout.y; }}
            >
              <Text accessibilityRole="header" style={styles.sectionLabel}>Tanggal Transaksi</Text>
              <DatePickerField value={date} onChange={setDate} label="Tanggal Transaksi" disabled={isSaving} />
              {showValidation && !dateValid && (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>Pilih tanggal di kalender.</Text>
              )}
            </View>

            <View
              style={styles.sectionItem}
              onLayout={({ nativeEvent }) => { fieldPositions.current.wallet = nativeEvent.layout.y; }}
            >
              <Text accessibilityRole="header" style={styles.sectionLabel}>Dompet</Text>
              {wallets.length > 0 ? (
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.pillsContent}
                >
                  {wallets.map((option) => {
                    const selected = wallet?.id === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        disabled={isSaving}
                        onPress={() => setSelectedWalletId(option.id)}
                        style={[styles.walletPill, selected && styles.walletPillActive]}
                      >
                        <Icon name={option.icon || 'wallet'} size={15} color={selected ? '#FFFFFF' : option.color} />
                        <Text style={[styles.walletPillText, selected && styles.walletPillTextActive]}>
                          {option.name}{option.is_archived ? ' (Arsip)' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={showValidation ? styles.errorText : styles.helperText}>
                  Belum ada dompet aktif. Tambahkan dompet dari tab Dompet.
                </Text>
              )}
              {showValidation && !wallet && wallets.length > 0 && (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>Pilih dompet transaksi.</Text>
              )}
            </View>

            <View
              style={styles.sectionItem}
              onLayout={({ nativeEvent }) => { fieldPositions.current.category = nativeEvent.layout.y; }}
            >
              <Text accessibilityRole="header" style={styles.sectionLabel}>Kategori</Text>
              {categoryStatus === 'loading' && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text accessibilityLiveRegion="polite" style={styles.helperText}>Memuat kategori…</Text>
                </View>
              )}
              {categoryStatus === 'error' && (
                <View style={styles.sectionItem}>
                  <Text accessibilityLiveRegion="polite" style={styles.errorText}>Kategori gagal dimuat.</Text>
                  <Button title="Muat Ulang Kategori" variant="outline" size="sm" onPress={() => setCategoryStatus('loading')} />
                </View>
              )}
              {categoryStatus === 'ready' && categories.length === 0 && (
                <Text style={showValidation ? styles.errorText : styles.helperText}>
                  Tambahkan kategori untuk jenis transaksi ini dari Pengaturan.
                </Text>
              )}
              {categories.length > 0 && (
                <View style={styles.categoriesGrid}>
                  {categories.map((option) => {
                    const selected = category?.id === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="button"
                        accessibilityLabel={option.name}
                        accessibilityState={{ selected }}
                        disabled={isSaving}
                        onPress={() => setSelectedCategoryId(option.id)}
                        style={[styles.catGridItem, selected && styles.catGridItemActive]}
                      >
                        <View style={[
                          styles.catIconWrap,
                          { backgroundColor: selected ? option.color : `${option.color}15` },
                        ]}>
                          <Icon name={option.icon || 'other'} size={20} color={selected ? '#FFFFFF' : option.color} />
                        </View>
                        <Text style={[styles.catNameText, selected && styles.catNameTextActive]} numberOfLines={2}>
                          {option.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {showValidation && !category && categories.length > 0 && (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>Pilih kategori transaksi.</Text>
              )}
            </View>

            <View style={styles.sectionItem}>
              <Text accessibilityRole="header" style={styles.sectionLabel}>Catatan (opsional)</Text>
              <TextInput
                ref={noteInput}
                accessibilityLabel="Catatan transaksi"
                editable={!isSaving}
                value={note}
                onChangeText={setNote}
                placeholder="Contoh: makan siang"
                placeholderTextColor={colors.textSecondary}
                style={styles.noteInput}
              />
            </View>
          </>
        )}
      </ScrollView>

      {ready && (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <View style={styles.footerContent}>
            {saveError && (
              <Text accessibilityLiveRegion="polite" style={styles.errorText}>Gagal menyimpan. {saveError}</Text>
            )}
            <Button
              title={isSaving ? 'Menyimpan transaksi…' : isEditing ? 'Simpan Perubahan' : 'Simpan Transaksi'}
              onPress={handleSave}
              disabled={categoryStatus === 'loading'}
              loading={isSaving}
              size="lg"
            />
          </View>
        </SafeAreaView>
      )}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerContainer: {
    backgroundColor: colors.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    flex: 1,
    ...Typography.title,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: Radius.md,
    padding: Spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: colors.surface,
  },
  toggleText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActiveExp: {
    color: colors.danger,
  },
  toggleTextActiveInc: {
    color: colors.success,
  },
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -Spacing.md,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  sectionItem: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.subtitle,
    color: colors.text,
  },
  helperText: {
    ...Typography.body,
    color: colors.textSecondary,
  },
  errorText: {
    ...Typography.body,
    color: colors.danger,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadPanel: {
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
  },
  amountCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  invalidAmountCard: {
    borderColor: colors.danger,
  },
  amountWrap: {
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  amountText: {
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  pillsContent: {
    gap: Spacing.sm,
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: Spacing.md,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  walletPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  walletPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  walletPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  catGridItem: {
    width: '22.5%',
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catGridItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  catIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catNameText: {
    ...Typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  catNameTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  noteInput: {
    ...Typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    minHeight: 48,
    paddingHorizontal: Spacing.md,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  keypadKey: {
    width: '33.33%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.borderLight,
  },
  keypadKeyPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  keypadKeyText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerContent: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
});

