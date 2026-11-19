import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { BatikPattern } from '../../components/decorative/BatikPattern';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getTotalBalance, getWallets } from '../../db/repositories/walletRepo';
import { useTheme } from '../../hooks/use-theme';
import type { Wallet } from '../../types';

const FILTERS = [['all', 'Semua'], ['cash', 'Tunai'], ['bank', 'Bank'], ['ewallet', 'E-Wallet'], ['credit_card', 'Kredit'], ['archived', 'Arsip']] as const;
type WalletFilter = typeof FILTERS[number][0];
const TYPE_LABELS = { cash: 'Uang Tunai', bank: 'Rekening Bank', ewallet: 'E-Wallet', credit_card: 'Kartu Kredit' };

export default function WalletScreen() {
  const colors = useTheme();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [total, setTotal] = useState(0);
  const [bookName, setBookName] = useState('Buku Aktif');
  const [filter, setFilter] = useState<WalletFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => {
    const request = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const book = await getDefaultBook();
      if (!book) throw new Error('Buku keuangan tidak ditemukan.');
      const [list, balance] = await Promise.all([getWallets(book.id, true), getTotalBalance(book.id)]);
      if (request !== version.current) return;
      setWallets(list);
      setTotal(balance);
      setBookName(book.name);
    } catch { if (request === version.current) setError('Daftar dompet belum dapat dimuat. Silakan coba lagi.'); }
    finally { if (request === version.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));
  const visible = wallets.filter((wallet) => filter === 'archived' ? wallet.is_archived !== 0 : wallet.is_archived === 0 && (filter === 'all' || wallet.type === filter));
  const addWallet = () => router.push('/wallet/add');
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Dompet Saya" subtitle={bookName} back={false} action={<Pressable accessibilityRole="button" accessibilityLabel="Tambah dompet" onPress={addWallet} style={{ padding: 8 }}><Icon name="plus" color="#FFFFFF" size={23} /></Pressable>} />
    <View style={{ margin: 20, padding: 20, borderRadius: 18, backgroundColor: '#1B365D', overflow: 'hidden', gap: 8 }}>
      <BatikPattern opacity={0.07} />
      <Text style={{ color: '#DDE9FF', fontSize: 12 }}>Total Saldo Dompet Aktif</Text>
      {loading || error ? <Text style={{ color: '#FFFFFF' }}>{loading ? 'Memuat saldo...' : 'Saldo belum dapat dimuat'}</Text> : <AmountDisplay amount={total} size="hero" style={{ color: '#FFFFFF' }} />}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 14 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {FILTERS.map(([value, label]) => <Pressable key={value} onPress={() => setFilter(value)} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: filter === value ? colors.primary : colors.surface }}><Text style={{ color: filter === value ? '#FFFFFF' : colors.text }}>{label}</Text></Pressable>)}
    </ScrollView>
    <FlatList data={loading || error ? [] : visible} keyExtractor={(wallet) => String(wallet.id)} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 12 }} refreshing={loading} onRefresh={() => { void load(); }}
      ListEmptyComponent={loading ? <Text style={{ color: colors.textSecondary }}>Memuat dompet...</Text> : <EmptyState icon="wallet" title={error ? 'Dompet Belum Dapat Dimuat' : filter === 'archived' ? 'Belum Ada Dompet Arsip' : 'Belum Ada Dompet'} subtitle={error || (filter === 'archived' ? 'Dompet yang diarsipkan tetap menyimpan riwayat transaksi.' : 'Tambahkan dompet atau pilih filter lainnya.')} action={<Button title={error ? 'Coba Lagi' : 'Tambah Dompet'} onPress={error ? () => { void load(); } : addWallet} />} />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/wallet/[id]', params: { id: item.id } })} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 18, borderRadius: 18, gap: 14 }}>
        <View style={{ padding: 12, borderRadius: 14, backgroundColor: `${item.color}18` }}><Icon name={item.icon} color={item.color} size={25} /></View>
        <View style={{ flex: 1, gap: 5 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{item.name}</Text><Text style={{ color: colors.textSecondary, fontSize: 12 }}>{TYPE_LABELS[item.type]}{item.is_archived ? ' · Diarsipkan' : ''}</Text><AmountDisplay amount={item.balance} size="md" /></View>
        <Icon name="chevRight" color={colors.textMuted} size={18} />
      </Pressable>} />
  </View>;
}
