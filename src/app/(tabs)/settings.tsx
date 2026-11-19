import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { Icon } from '../../components/ui/Icon';
import { useAppPreferences } from '../../contexts/AppPreferences';
import { getAllBooks, getDefaultBook } from '../../db/repositories/bookRepo';
import { useTheme } from '../../hooks/use-theme';
import type { ThemePreference } from '../../db/repositories/settingsRepo';

export default function SettingsScreen() {
  const colors = useTheme();
  const { theme, setTheme } = useAppPreferences();
  const [bookLabel, setBookLabel] = useState('Memuat buku...');
  const [themeBusy, setThemeBusy] = useState(false);
  const themeLock = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([getDefaultBook(), getAllBooks()]).then(([book, books]) => {
      if (active) setBookLabel(`${book?.name ?? 'Belum ada buku'} · ${books.length} buku`);
    }).catch(() => { if (active) setBookLabel('Buka untuk memuat daftar buku'); });
    return () => { active = false; };
  }, []));
  const changeTheme = async (value: ThemePreference) => {
    if (themeLock.current || value === theme) return;
    themeLock.current = true;
    setThemeBusy(true);
    try { await setTheme(value); }
    catch { Alert.alert('Tema Belum Berubah', 'Pengaturan belum dapat disimpan. Silakan coba lagi.'); }
    finally { themeLock.current = false; setThemeBusy(false); }
  };
  const menu = (icon: string, title: string, subtitle: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: colors.surface, borderRadius: 16 }}>
      <Icon name={icon} size={23} color={colors.primary} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{subtitle}</Text>
      </View>
      <Icon name="chevRight" size={18} color={colors.textMuted} />
    </Pressable>
  );
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Pengaturan" subtitle="Kelola tampilan dan data keuangan" back={false} />
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 36 }}>
      <Text style={{ color: colors.text, fontWeight: '600' }}>Tampilan</Text>
      <View style={{ padding: 16, gap: 14, backgroundColor: colors.surface, borderRadius: 16 }}>
        <Text style={{ color: colors.text }}>Tema aplikasi</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['system', 'Sistem'], ['light', 'Terang'], ['dark', 'Gelap']] as const).map(([value, label]) => (
            <Pressable key={value} disabled={themeBusy} onPress={() => { void changeTheme(value); }} accessibilityRole="radio" accessibilityState={{ checked: theme === value, disabled: themeBusy }} style={{ flex: 1, alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: theme === value ? colors.primary : colors.background }}>
              <Text style={{ color: theme === value ? '#FFFFFF' : colors.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Mata uang: Rupiah Indonesia (IDR)</Text>
      </View>
      <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>Keuangan</Text>
      {menu('wallet', 'Buku Keuangan', bookLabel, () => router.push('/manage/books'))}
      {menu('filter', 'Kelola Kategori', 'Tambah, ubah, dan hapus kategori pribadi', () => router.push('/manage/categories'))}
      {menu('chart', 'Ekspor dan Cadangan', 'Bagikan CSV, buat cadangan, atau pulihkan data', () => router.push('/manage/data'))}
      {menu('check', 'Panduan Kaskuy', 'Kenali cara mencatat dan mengelola keuangan', () => router.push('/onboarding'))}
      <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>Scan Struk</Text>
      {menu('scan', 'Scan Struk Belanja', 'Foto atau pilih struk dari galeri', () => router.push('/scan'))}
      {menu('camera', 'Penguji OCR', 'Periksa teks hasil pembacaan struk', () => router.push('/scan/test-ocr'))}
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16 }}>Kaskuy v1.0.0 · Pencatatan keuangan offline</Text>
    </ScrollView>
  </View>;
}
