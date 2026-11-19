import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { useAppPreferences } from '../contexts/AppPreferences';
import { useTheme } from '../hooks/use-theme';

export default function OnboardingScreen() {
  const colors = useTheme();
  const { completeOnboarding } = useAppPreferences();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const start = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try { await completeOnboarding(); router.replace('/(tabs)'); }
    catch { Alert.alert('Belum Berhasil', 'Panduan belum dapat disimpan. Silakan coba lagi.'); saving.current = false; }
    finally { setBusy(false); }
  };
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Selamat datang di Kaskuy" subtitle="Kenali kebiasaan keuangan Anda" back={false} />
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      {[
        ['wallet', 'Catat setiap transaksi', 'Simpan pemasukan dan pengeluaran, pilih dompet dan kategori, lalu lihat perubahan saldo.'],
        ['chart', 'Atur budget dan lihat laporan', 'Tetapkan anggaran bulanan. Tekan kategori atau grafik untuk menelusuri transaksinya.'],
        ['scan', 'Catat belanja dari struk', 'Tombol Scan membuka kamera atau galeri. Periksa dan koreksi data struk sebelum menyimpannya sebagai transaksi.'],
        ['savings', 'Pisahkan buku keuangan', 'Gunakan buku berbeda untuk kebutuhan pribadi, rumah tangga, atau usaha.'],
        ['check', 'Data tersimpan di perangkat', 'Aplikasi dapat dipakai offline. Bagikan cadangan dari Pengaturan secara berkala agar data dapat dipulihkan.'],
      ].map(([icon, title, body]) => <View key={title} style={{ padding: 20, gap: 10, backgroundColor: colors.surface, borderRadius: 18 }}>
        <Icon name={icon} size={28} color={colors.primary} />
        <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, lineHeight: 22 }}>{body}</Text>
      </View>)}
      <Button title="Mulai Mencatat" onPress={() => { void start(); }} loading={busy} />
    </ScrollView>
  </View>;
}
