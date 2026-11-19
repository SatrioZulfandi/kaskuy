import { useTheme, useThemedStyles } from '../../hooks/use-theme';
// src/app/transaction/add.tsx
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/ui/Button';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Typography, type ThemeColors } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { createTransaction, getTransactionById, updateTransaction } from '../../db/repositories/transactionRepo';
import { getWallets } from '../../db/repositories/walletRepo';
import { formatRupiah } from '../../lib/currency';
import { getTodayDateString, isValidDateString } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { Category, TransactionType, Wallet } from '../../types';

const KEYPAD_KEYS = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '000', '0', '⌫',
];

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
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(getTodayDateString());
  const [note, setNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [bookId, setBookId] = useState<number | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loading = loadedKey !== formKey;
  const ready = !loading && !loadError;
  const saving = useRef(false);
  const screenFocused = useRef(false);

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
        setBookId(book.id);
        setType(initialType);
        setWallets(wList);
        setSelectedWalletId(existing?.wallet_id ?? wList[0]?.id ?? null);
        setCategories(cList);
        setSelectedCategoryId(existing?.category_id ?? cList[0]?.id ?? null);
        if (existing) {
          setAmountStr(String(existing.amount));
          setDate(existing.date);
          setNote(existing.note ?? '');
        }
      } catch (error: unknown) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Gagal memuat transaksi.');
      } finally {
        if (active) setLoadedKey(formKey);
      }
    }
    void loadData();
    return () => { active = false; };
  }, [formKey, isEditing, params.id, params.type]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const loadCategories = async () => {
      try {
        const list = await getCategories(type);
        if (!active) return;
        setCategories(list);
        setSelectedCategoryId((selected) => list.some((category) => category.id === selected) ? selected : list[0]?.id ?? null);
      } catch {
        if (active) { setCategories([]); setSelectedCategoryId(null); Alert.alert('Gagal Memuat Kategori', 'Silakan pilih jenis transaksi kembali.'); }
      }
    };
    void loadCategories();
    return () => { active = false; };
  }, [ready, type]);

  const handleKeypadPress = (key: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }

    if (key === '⌫') {
      if (amountStr.length <= 1) {
        setAmountStr('0');
      } else {
        setAmountStr(amountStr.slice(0, -1));
      }
      return;
    }

    if (amountStr === '0') {
      if (key === '000' || key === '0') return;
      setAmountStr(key);
    } else {
      const nextAmount = amountStr + key;
      if (!Number.isSafeInteger(Number(nextAmount))) return;
      setAmountStr(nextAmount);
    }
  };

  const handleSave = async () => {
    if (!screenFocused.current || saving.current || loading || loadError || !bookId) return;
    const numericAmount = Number(amountStr);
    if (!Number.isSafeInteger(numericAmount) || numericAmount <= 0) {
      Alert.alert('Nominal Kosong', 'Silakan masukkan jumlah nominal transaksi.');
      return;
    }
    if (!selectedWalletId || !selectedCategoryId) {
      Alert.alert('Belum Lengkap', 'Pilih dompet dan kategori.');
      return;
    }
    if (!isValidDateString(date)) {
      Alert.alert('Tanggal Tidak Valid', 'Masukkan tanggal yang benar dengan format YYYY-MM-DD.');
      return;
    }
    if (!categories.some((category) => category.id === selectedCategoryId && category.type === type)) {
      Alert.alert('Kategori Tidak Sesuai', 'Pilih kategori sesuai jenis transaksi.');
      return;
    }

    saving.current = true;
    setIsSaving(true);
    let saved = false;
    try {
      const values = {
        wallet_id: selectedWalletId,
        category_id: selectedCategoryId,
        type,
        amount: numericAmount,
        note: note.trim() || null,
        date,
      };
      if (isEditing) await updateTransaction(Number(params.id), values);
      else await createTransaction({ ...values, book_id: bookId });

      saved = true;
      if (screenFocused.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch (err: any) {
      if (screenFocused.current) Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      if (!saved) saving.current = false;
      if (screenFocused.current) setIsSaving(false);
    }
  };

  const isExpense = type === 'expense';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} disabled={isSaving} style={styles.closeBtn}>
              <Icon name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.screenTitle}>{isEditing ? 'Edit Transaksi' : 'Catat Transaksi'}</Text>
            <Pressable
              disabled={isSaving}
              onPress={() => router.push('/scan' as any)}
              style={styles.scanShortcutBtn}
            >
              <Icon name="scan" size={18} color="#FFFFFF" strokeWidth={2} />
            </Pressable>
          </View>

          {/* Type Toggle: Pengeluaran ↔ Pemasukan */}
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => {
                if (type === 'expense') return;
                setType('expense');
                setSelectedCategoryId(null);
                setCategories([]);
                if (!isEditing) setAmountStr('0');
              }}
              style={[styles.toggleBtn, isExpense && styles.toggleBtnActiveExp]}
            >
              <Text style={[styles.toggleText, isExpense && styles.toggleTextActiveExp]}>
                Pengeluaran
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (type === 'income') return;
                setType('income');
                setSelectedCategoryId(null);
                setCategories([]);
                if (!isEditing) setAmountStr('0');
              }}
              style={[styles.toggleBtn, !isExpense && styles.toggleBtnActiveInc]}
            >
              <Text style={[styles.toggleText, !isExpense && styles.toggleTextActiveInc]}>
                Pemasukan
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={styles.scrollContent}>
        {loading || loadError ? (
          <Text style={styles.sectionLabel}>{loading ? 'Memuat transaksi...' : loadError}</Text>
        ) : (
          <>
        {/* Amount Display with large font */}
        <View style={styles.amountWrap}>
          <Text
            style={[
              styles.amountText,
              { color: isExpense ? colors.danger : colors.success },
            ]}
          >
            {formatRupiah(parseInt(amountStr, 10) || 0)}
          </Text>
        </View>

        {/* Wallet Picker */}
        <View style={styles.sectionItem}>
          <Text style={styles.sectionLabel}>Pilih Dompet</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
            {wallets.map((w) => {
              const sel = selectedWalletId === w.id;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => setSelectedWalletId(w.id)}
                  style={[styles.walletPill, sel && styles.walletPillActive]}
                >
                  <Icon name={w.icon || 'wallet'} size={15} color={sel ? '#FFFFFF' : w.color} />
                  <Text style={[styles.walletPillText, sel && styles.walletPillTextActive]}>
                    {w.name}{w.is_archived ? ' (Arsip)' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Categories Grid Picker */}
        <View style={styles.sectionItem}>
          <Text style={styles.sectionLabel}>Pilih Kategori</Text>
          <View style={styles.categoriesGrid}>
            {categories.map((c) => {
              const sel = selectedCategoryId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setSelectedCategoryId(c.id)}
                  style={[styles.catGridItem, sel && styles.catGridItemActive]}
                >
                  <View
                    style={[
                      styles.catIconWrap,
                      { backgroundColor: `${c.color}15` },
                      sel && { backgroundColor: c.color },
                    ]}
                  >
                    <Icon
                      name={c.icon || 'other'}
                      size={20}
                      color={sel ? '#FFFFFF' : c.color}
                    />
                  </View>
                  <Text
                    style={[
                      styles.catNameText,
                      sel && { color: colors.primary, fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Note & Date */}
        <View style={styles.formCard}>
          <View style={styles.inputRow}>
            <Icon name="camera" size={18} color={colors.textMuted} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Tambah catatan (opsional)"
              placeholderTextColor={colors.textMuted}
              style={styles.noteInput}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.dateField}>
            <Text style={styles.sectionLabel}>Tanggal Transaksi</Text>
            <DatePickerField value={date} onChange={setDate} label="Tanggal Transaksi" />
          </View>
        </View>

        {/* Custom Keypad */}
        <View style={styles.keypadCard}>
          <View style={styles.keypadGrid}>
            {KEYPAD_KEYS.map((key) => (
              <Pressable
                key={key}
                onPress={() => handleKeypadPress(key)}
                style={({ pressed }) => [
                  styles.keypadKey,
                  pressed && styles.keypadKeyPressed,
                ]}
              >
                <Text
                  style={[
                    styles.keypadKeyText,
                    key === '⌫' && { color: colors.danger },
                  ]}
                >
                  {key}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <View style={styles.saveActionWrap}>
          <Button
            title={isEditing ? 'Simpan Perubahan' : 'Simpan Transaksi'}
            onPress={handleSave}
            loading={isSaving}
            size="lg"
          />
        </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  dateField: {
    padding: 12,
    gap: 8,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.primaryDark,
  },
  headerContainer: {
    backgroundColor: colors.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: Typography.header.fontSize,
    fontWeight: Typography.header.fontWeight,
    color: '#FFFFFF',
  },
  scanShortcutBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: Radius.md,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  toggleBtnActiveExp: {
    backgroundColor: colors.surface,
  },
  toggleBtnActiveInc: {
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
    marginTop: -12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 16,
  },
  amountWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  amountText: {
    fontSize: 34,
    fontWeight: '700',
  },
  sectionItem: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 2,
  },
  pillsScroll: {
    flexDirection: 'row',
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    marginRight: 8,
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
    gap: 10,
  },
  catGridItem: {
    width: '22.5%',
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  catGridItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  catIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catNameText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  noteInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  keypadCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  keypadKey: {
    width: '33.33%',
    paddingVertical: 14,
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
  saveActionWrap: {
    marginTop: 6,
  },
});

