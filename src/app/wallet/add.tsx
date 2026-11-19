import { useTheme, useThemedStyles } from '../../hooks/use-theme';
// src/app/wallet/add.tsx
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
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Typography, type ThemeColors } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { createWallet, getWalletById, updateWallet } from '../../db/repositories/walletRepo';
import { formatRupiah, parseRupiahInput } from '../../lib/currency';
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
const ICONS = ['wallet', 'cash', 'bank', 'phone', 'creditCard', 'savings', 'business', 'shop', 'gift'];

export default function AddWalletScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = params.id !== undefined;
  const formKey = params.id ?? 'new';
  const [name, setName] = useState('');
  const [type, setType] = useState<WalletType>('bank');
  const [initialBalance, setInitialBalance] = useState('0');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState('bank');
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== formKey;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const screenFocused = useRef(false);

  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    return () => { screenFocused.current = false; };
  }, []));

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!isEditing) {
          const book = await getDefaultBook();
          if (!book) throw new Error('Buku keuangan tidak ditemukan.');
          if (active) setLoadError(null);
          return;
        }
        const id = Number(params.id);
        const wallet = Number.isSafeInteger(id) && id > 0 ? await getWalletById(id) : null;
        if (!wallet) throw new Error('Dompet tidak ditemukan.');
        if (active) {
          setLoadError(null);
          setName(wallet.name);
          setType(wallet.type);
          setSelectedIcon(wallet.icon);
          setSelectedColor(wallet.color);
          setCurrentBalance(wallet.balance);
        }
      } catch (error: unknown) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Gagal memuat dompet.');
      } finally {
        if (active) setLoadedKey(formKey);
      }
    };
    void load();
    return () => { active = false; };
  }, [formKey, isEditing, params.id]);

  const handleSave = async () => {
    if (!screenFocused.current || saving.current || loading || loadError) return;
    if (!name.trim()) {
      Alert.alert('Nama Kosong', 'Silakan masukkan nama dompet atau rekening.');
      return;
    }

    const balance = isEditing ? 0 : parseRupiahInput(initialBalance);
    if (balance === null) {
      Alert.alert('Saldo Tidak Valid', 'Masukkan saldo dalam Rupiah bulat, misalnya 1500000 atau 1.500.000. Isi 0 jika belum ada saldo.');
      return;
    }

    saving.current = true;
    setIsSaving(true);
    let saved = false;
    try {
      if (isEditing) {
        await updateWallet(Number(params.id), { name: name.trim(), type, icon: selectedIcon, color: selectedColor });
      } else {
        const book = await getDefaultBook();
        if (!book) throw new Error('Buku keuangan tidak ditemukan.');
        await createWallet(book.id, name.trim(), type, balance, selectedIcon, selectedColor);
      }

      saved = true;
      if (screenFocused.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch (err: any) {
      if (screenFocused.current) Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan');
    } finally {
      if (!saved) saving.current = false;
      if (screenFocused.current) setIsSaving(false);
    }
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
            <Pressable onPress={() => router.back()} disabled={isSaving} style={styles.closeBtn}>
              <Icon name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.screenTitle}>{isEditing ? 'Edit Dompet' : 'Tambah Dompet'}</Text>
            <View style={{ width: 34 }} />
          </View>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={styles.scrollContent}>
        {loading || loadError ? (
          <Text style={styles.inputLabel}>{loading ? 'Memuat dompet...' : loadError}</Text>
        ) : (
          <>
        {/* Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Nama Dompet / Rekening</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Contoh: BCA Tabungan, GoPay, Tunai"
            placeholderTextColor={colors.textMuted}
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
                  onPress={() => { setType(t.type); setSelectedIcon(t.icon); }}
                  style={[styles.typeItem, sel && styles.typeItemActive]}
                >
                  <Icon
                    name={t.icon}
                    size={22}
                    color={sel ? colors.primary : colors.textSecondary}
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
          <Text style={styles.inputLabel}>{isEditing ? 'Saldo Saat Ini' : 'Saldo Awal (Rp)'}</Text>
          {isEditing ? (
            <>
              <Text style={styles.textInput}>{formatRupiah(currentBalance)}</Text>
              <Text style={styles.inputLabel}>Saldo mengikuti riwayat transaksi. Catat pemasukan atau pengeluaran untuk menyesuaikannya.</Text>
            </>
          ) : (
            <TextInput value={initialBalance} onChangeText={setInitialBalance} keyboardType="numeric" placeholder="0"
              placeholderTextColor={colors.textMuted} style={styles.textInput} />
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Pilih Ikon</Text>
          <View style={styles.colorRow}>
            {ICONS.map((icon) => (
              <Pressable key={icon} onPress={() => setSelectedIcon(icon)}
                accessibilityLabel={`Ikon ${icon}`} accessibilityState={{ selected: selectedIcon === icon }}
                style={[styles.iconChoice, selectedIcon === icon && styles.typeItemActive]}>
                <Icon name={icon} size={22} color={selectedColor} />
              </Pressable>
            ))}
          </View>
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
            title={isEditing ? 'Simpan Perubahan' : 'Simpan Dompet'}
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeItem: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  typeItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  typeItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  typeItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconChoice: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
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

