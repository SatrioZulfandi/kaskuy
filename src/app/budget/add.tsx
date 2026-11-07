// src/app/budget/add.tsx
import { router } from 'expo-router';
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
import { setBudget } from '../../db/repositories/budgetRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { formatRupiah } from '../../lib/currency';
import { getCurrentMonthString } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { Category } from '../../types';

export default function AddBudgetScreen() {
  const topInset = useTopInset(12);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [month, setMonth] = useState<string>(getCurrentMonthString());
  const [amountStr, setAmountStr] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadCategories() {
      try {
        const list = await getCategories('expense');
        setCategories(list);
        if (list.length > 0) setSelectedCategoryId(list[0].id);
      } catch (err) {
        console.error('Failed to load categories for budget:', err);
      }
    }
    loadCategories();
  }, []);

  const handleSave = async () => {
    if (!selectedCategoryId) {
      Alert.alert('Pilih Kategori', 'Silakan pilih kategori pengeluaran.');
      return;
    }
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Nominal Tidak Valid', 'Masukkan nominal budget bulanan yang lebih besar dari 0.');
      return;
    }

    setIsSaving(true);
    try {
      const book = await getDefaultBook();
      if (!book) return;

      await setBudget(book.id, selectedCategoryId, month, amount);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
    }
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
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.closeBtn}>
              <Icon name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.screenTitle}>Atur Budget Bulanan</Text>
            <View style={{ width: 34 }} />
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={styles.scrollContent}>
        {/* Month */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Bulan (YYYY-MM)</Text>
          <TextInput
            value={month}
            onChangeText={setMonth}
            placeholder="YYYY-MM"
            style={styles.textInput}
          />
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

        {/* Budget Amount */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Batas Anggaran / Budget (Rp)</Text>
          <TextInput
            value={amountStr}
            onChangeText={setAmountStr}
            keyboardType="numeric"
            placeholder="Contoh: 1500000"
            style={[styles.textInput, styles.amountInput]}
          />
          {amountStr ? (
            <Text style={styles.formattedHint}>
              {formatRupiah(parseInt(amountStr, 10) || 0)}
            </Text>
          ) : null}
        </View>

        <View style={styles.saveActionWrap}>
          <Button
            title="Simpan Budget"
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
    backgroundColor: Colors.light.background,
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
    color: Colors.light.textSecondary,
    marginLeft: 2,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.light.text,
  },
  amountInput: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.primary,
  },
  formattedHint: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.success,
    marginLeft: 2,
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
  saveActionWrap: {
    marginTop: 12,
  },
});

