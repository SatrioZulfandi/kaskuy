// src/app/wallet/add.tsx
import { router } from 'expo-router';
import React, { useState } from 'react';
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
import { createWallet } from '../../db/repositories/walletRepo';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import type { WalletType } from '../../types';

const WALLET_TYPES: { type: WalletType; label: string; icon: string }[] = [
  { type: 'cash', label: 'Uang Tunai', icon: 'cash' },
  { type: 'bank', label: 'Rekening Bank', icon: 'bank' },
  { type: 'ewallet', label: 'E-Wallet', icon: 'phone' },
  { type: 'credit_card', label: 'Kartu Kredit', icon: 'creditCard' },
];

const COLORS = [
  '#0066FF', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#00AED6', '#6366F1',
];

export default function AddWalletScreen() {
  const topInset = useTopInset(12);
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('bank');
  const [initialBalance, setInitialBalance] = useState('0');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Nama Kosong', 'Silakan masukkan nama dompet atau rekening.');
      return;
    }

    const balanceNum = parseInt(initialBalance, 10);
    const balance = isNaN(balanceNum) ? 0 : balanceNum;

    setIsSaving(true);
    try {
      const book = await getDefaultBook();
      if (!book) return;

      const typeDef = WALLET_TYPES.find((t) => t.type === type);
      await createWallet(
        book.id,
        name.trim(),
        type,
        balance,
        typeDef?.icon || 'wallet',
        selectedColor
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan');
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
            <Text style={styles.screenTitle}>Tambah Dompet Baru</Text>
            <View style={{ width: 34 }} />
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={styles.scrollContent}>
        {/* Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Nama Dompet / Rekening</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Contoh: BCA Tabungan, GoPay, Tunai"
            style={styles.textInput}
          />
        </View>

        {/* Type Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Tipe Dompet</Text>
          <View style={styles.typeGrid}>
            {WALLET_TYPES.map((t) => {
              const sel = type === t.type;
              return (
                <Pressable
                  key={t.type}
                  onPress={() => setType(t.type)}
                  style={[styles.typeItem, sel && styles.typeItemActive]}
                >
                  <Icon
                    name={t.icon}
                    size={22}
                    color={sel ? Colors.light.primary : Colors.light.textSecondary}
                  />
                  <Text style={[styles.typeItemText, sel && styles.typeItemTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Initial Balance */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Saldo Awal (Rp)</Text>
          <TextInput
            value={initialBalance}
            onChangeText={setInitialBalance}
            keyboardType="numeric"
            placeholder="0"
            style={styles.textInput}
          />
        </View>

        {/* Color Picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Pilih Warna Aksen</Text>
          <View style={styles.colorRow}>
            {COLORS.map((c) => {
              const sel = selectedColor === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setSelectedColor(c)}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    sel && styles.colorCircleActive,
                  ]}
                >
                  {sel && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={2.5} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Save Button */}
        <View style={styles.saveActionWrap}>
          <Button
            title="Simpan Dompet"
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeItem: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  typeItemActive: {
    borderColor: Colors.light.primary,
    backgroundColor: '#EBF3FF',
  },
  typeItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.light.textSecondary,
  },
  typeItemTextActive: {
    color: Colors.light.primary,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleActive: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  saveActionWrap: {
    marginTop: 12,
  },
});

