// src/app/transaction/add.tsx
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Colors, Radius, Typography } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { createTransaction } from '../../db/repositories/transactionRepo';
import { getWallets } from '../../db/repositories/walletRepo';
import { formatRupiah } from '../../lib/currency';
import { getTodayDateString } from '../../lib/date';
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
  const topInset = useTopInset(12);
  const params = useLocalSearchParams();
  const [type, setType] = useState<TransactionType>(
    (params.type as TransactionType) || 'expense'
  );
  const [amountStr, setAmountStr] = useState<string>('0');
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(getTodayDateString());
  const [note, setNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const book = await getDefaultBook();
        if (!book) return;

        const wList = await getWallets(book.id);
        setWallets(wList);
        if (wList.length > 0) setSelectedWalletId(wList[0].id);

        const cList = await getCategories(type);
        setCategories(cList);
        if (cList.length > 0) setSelectedCategoryId(cList[0].id);
      } catch (err) {
        console.error('Failed to load transaction form data:', err);
      }
    }
    loadData();
  }, [type]);

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
      if (amountStr.length >= 10) return; // Limit to 10 digits
      setAmountStr(amountStr + key);
    }
  };

  const handleSave = async () => {
    const numericAmount = parseInt(amountStr, 10);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Nominal Kosong', 'Silakan masukkan jumlah nominal transaksi.');
      return;
    }
    if (!selectedWalletId || !selectedCategoryId) {
      Alert.alert('Belum Lengkap', 'Pilih dompet dan kategori.');
      return;
    }

    setIsSaving(true);
    try {
      const book = await getDefaultBook();
      if (!book) return;

      await createTransaction({
        book_id: book.id,
        wallet_id: selectedWalletId,
        category_id: selectedCategoryId,
        type,
        amount: numericAmount,
        note: note.trim() || null,
        date,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
    }
  };

  const isExpense = type === 'expense';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.gradientStart, Colors.light.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.closeBtn}>
              <Icon name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.screenTitle}>Catat Transaksi</Text>
            <Pressable
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
                setType('expense');
                setAmountStr('0');
              }}
              style={[styles.toggleBtn, isExpense && styles.toggleBtnActiveExp]}
            >
              <Text style={[styles.toggleText, isExpense && styles.toggleTextActiveExp]}>
                Pengeluaran
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setType('income');
                setAmountStr('0');
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
        {/* Amount Display with large font */}
        <View style={styles.amountWrap}>
          <Text
            style={[
              styles.amountText,
              { color: isExpense ? Colors.light.danger : Colors.light.success },
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
                    {w.name}
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
                      sel && { color: Colors.light.primary, fontWeight: '600' },
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
            <Icon name="camera" size={18} color={Colors.light.textMuted} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Tambah catatan (opsional)"
              style={styles.noteInput}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.inputRow}>
            <Icon name="settings" size={18} color={Colors.light.textMuted} />
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              style={styles.noteInput}
            />
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
                    key === '⌫' && { color: Colors.light.danger },
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
            title="Simpan Transaksi"
            onPress={handleSave}
            loading={isSaving}
            size="lg"
          />
        </View>
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
    backgroundColor: '#FFFFFF',
  },
  toggleBtnActiveInc: {
    backgroundColor: '#FFFFFF',
  },
  toggleText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  toggleTextActiveExp: {
    color: Colors.light.danger,
  },
  toggleTextActiveInc: {
    color: Colors.light.success,
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
    color: Colors.light.textSecondary,
    marginLeft: 2,
  },
  pillsScroll: {
    flexDirection: 'row',
  },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  walletPillActive: {
    backgroundColor: Colors.light.primary,
    borderColor: Colors.light.primary,
  },
  walletPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.light.text,
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
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  catGridItemActive: {
    borderColor: Colors.light.primary,
    backgroundColor: '#F0F7FF',
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
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
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
    color: Colors.light.text,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  keypadCard: {
    backgroundColor: '#FFFFFF',
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
    borderColor: '#F3F4F6',
  },
  keypadKeyPressed: {
    backgroundColor: '#F9FAFB',
  },
  keypadKeyText: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.light.text,
  },
  saveActionWrap: {
    marginTop: 6,
  },
});

