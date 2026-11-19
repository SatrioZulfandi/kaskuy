import { useTheme, useThemedStyles } from '../../hooks/use-theme';
// src/app/budget/add.tsx
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
import { deleteBudget, getBudgetById, setBudget, updateBudget } from '../../db/repositories/budgetRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { formatRupiah, parseRupiahInput } from '../../lib/currency';
import { getCurrentMonthString, isValidMonthString } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { Category } from '../../types';

export default function AddBudgetScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const params = useLocalSearchParams<{ id?: string; month?: string }>();
  const isEditing = params.id !== undefined;
  const formKey = params.id ?? `new:${params.month ?? ''}`;
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [month, setMonth] = useState<string>(
    typeof params.month === 'string' && isValidMonthString(params.month) ? params.month : getCurrentMonthString()
  );
  const [amountStr, setAmountStr] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== formKey;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookId, setBookId] = useState<number | null>(null);
  const saving = useRef(false);
  const deletePhase = useRef<'idle' | 'confirming' | 'deleting' | 'done'>('idle');
  const screenFocused = useRef(false);
  const parsedAmount = parseRupiahInput(amountStr);

  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    return () => { screenFocused.current = false; };
  }, []));

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const id = Number(params.id);
        if (isEditing && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Budget tidak ditemukan.');
        const [list, existing, activeBook] = await Promise.all([
          getCategories('expense'),
          isEditing ? getBudgetById(id) : Promise.resolve(null),
          getDefaultBook(),
        ]);
        if (isEditing && !existing) throw new Error('Budget tidak ditemukan.');
        if (!existing && !activeBook) throw new Error('Buku keuangan tidak ditemukan.');
        if (active) {
          setLoadError(null);
          setCategories(list);
          setBookId(existing?.book_id ?? activeBook!.id);
          setSelectedCategoryId(existing?.category_id ?? list[0]?.id ?? null);
          if (existing) { setMonth(existing.month); setAmountStr(String(existing.amount)); }
        }
      } catch (error: unknown) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Gagal memuat budget.');
      } finally {
        if (active) setLoadedKey(formKey);
      }
    }
    void loadData();
    return () => { active = false; };
  }, [formKey, isEditing, params.id]);

  const handleSave = async () => {
    if (!screenFocused.current || saving.current || loading || loadError || !bookId) return;
    if (!selectedCategoryId) {
      Alert.alert('Pilih Kategori', 'Silakan pilih kategori pengeluaran.');
      return;
    }
    const amount = parsedAmount;
    if (amount === null || amount <= 0) {
      Alert.alert('Nominal Tidak Valid', 'Masukkan nominal budget bulanan yang lebih besar dari 0.');
      return;
    }
    if (!isValidMonthString(month)) {
      Alert.alert('Bulan Tidak Valid', 'Masukkan bulan yang benar dengan format YYYY-MM.');
      return;
    }

    saving.current = true;
    setIsSaving(true);
    let saved = false;
    try {
      if (isEditing) await updateBudget(Number(params.id), { category_id: selectedCategoryId, month, amount });
      else await setBudget(bookId, selectedCategoryId, month, amount);
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

  const handleDelete = () => {
    if (!screenFocused.current || saving.current || !isEditing || loading || loadError) return;
    saving.current = true;
    deletePhase.current = 'confirming';
    const cancel = () => {
      if (deletePhase.current === 'confirming') { deletePhase.current = 'idle'; saving.current = false; }
    };
    Alert.alert('Hapus Budget', 'Batas budget ini akan dihapus. Riwayat transaksi tetap tersimpan.', [
      { text: 'Batal', style: 'cancel', onPress: cancel },
      { text: 'Hapus', style: 'destructive', onPress: async () => {
        if (deletePhase.current !== 'confirming' || !screenFocused.current) { cancel(); return; }
        deletePhase.current = 'deleting';
        setIsDeleting(true);
        let deleted = false;
        try {
          await deleteBudget(Number(params.id));
          deleted = true;
          if (screenFocused.current) router.back();
        } catch (error: unknown) {
          if (screenFocused.current) Alert.alert('Gagal Menghapus', error instanceof Error ? error.message : 'Silakan coba lagi.');
        } finally {
          deletePhase.current = deleted ? 'done' : 'idle';
          if (!deleted) saving.current = false;
          if (screenFocused.current) setIsDeleting(false);
        }
      } },
    ], { cancelable: true, onDismiss: cancel });
  };

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
            <Pressable onPress={() => router.back()} disabled={isSaving || isDeleting} style={styles.closeBtn}>
              <Icon name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.screenTitle}>{isEditing ? 'Edit Budget' : 'Atur Budget Bulanan'}</Text>
            <View style={{ width: 34 }} />
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={styles.scrollContent}>
        {loading || loadError ? <Text style={styles.inputLabel}>{loading ? 'Memuat budget...' : loadError}</Text> : (
          <>
        {/* Month */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Bulan Budget</Text>
          <DatePickerField value={month} onChange={setMonth} monthOnly label="Bulan Budget" />
        </View>

        {/* Category Picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Pilih Kategori Pengeluaran</Text>
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
                    <Icon name={c.icon || 'other'} size={20} color={sel ? '#FFFFFF' : c.color} />
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

        {/* Budget Amount */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Batas Anggaran / Budget (Rp)</Text>
          <TextInput
            value={amountStr}
            onChangeText={setAmountStr}
            keyboardType="numeric"
            placeholder="Contoh: 1500000"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, styles.amountInput]}
          />
          {amountStr ? (
            <Text style={styles.formattedHint}>
              {parsedAmount === null ? 'Format nominal belum valid' : formatRupiah(parsedAmount)}
            </Text>
          ) : null}
        </View>

        <View style={styles.saveActionWrap}>
          <Button
            title={isEditing ? 'Simpan Perubahan' : 'Simpan Budget'}
            onPress={handleSave}
            loading={isSaving}
            disabled={isDeleting}
            size="lg"
          />
          {isEditing ? <Button title="Hapus Budget" variant="danger" onPress={handleDelete}
            loading={isDeleting} disabled={isSaving} style={{ marginTop: 12 }} /> : null}
        </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    paddingBottom: 22,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  contentBody: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 18,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 2,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  formattedHint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
    marginLeft: 2,
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
  saveActionWrap: {
    marginTop: 12,
  },
});

