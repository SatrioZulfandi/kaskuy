import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { getTransactions } from '../../db/repositories/transactionRepo';
import { getWallets } from '../../db/repositories/walletRepo';
import { formatReadableDate, isValidDateString } from '../../lib/date';
import { useTheme } from '../../hooks/use-theme';
import type { Category, TransactionType, TransactionWithDetails, Wallet } from '../../types';

const PAGE_SIZE = 50;
const positiveId = (value: string | undefined) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
};

export default function TransactionListScreen() {
  const params = useLocalSearchParams<{ title?: string; startDate?: string; endDate?: string; categoryId?: string; walletId?: string; type?: string }>();
  const colors = useTheme();
  const [startDate, setStartDate] = useState(params.startDate && isValidDateString(params.startDate) ? params.startDate : '');
  const [endDate, setEndDate] = useState(params.endDate && isValidDateString(params.endDate) ? params.endDate : '');
  const [type, setType] = useState<TransactionType | undefined>(params.type === 'income' || params.type === 'expense' ? params.type : undefined);
  const [categoryId, setCategoryId] = useState(positiveId(params.categoryId));
  const [walletId, setWalletId] = useState(positiveId(params.walletId));
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [items, setItems] = useState<TransactionWithDetails[]>([]);
  const [bookId, setBookId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const moreLock = useRef(false);
  const load = useCallback(async () => {
    const request = ++version.current;
    setLoading(true);
    setError(null);
    try {
      if (startDate && endDate && startDate > endDate) throw new Error('Tanggal awal tidak boleh melewati tanggal akhir.');
      const book = await getDefaultBook();
      if (!book) throw new Error('Buku keuangan tidak ditemukan.');
      const [rows, categoryList, walletList] = await Promise.all([
        getTransactions(book.id, { startDate: startDate || undefined, endDate: endDate || undefined, categoryId, walletId, type, search, limit: PAGE_SIZE + 1 }),
        getCategories(), getWallets(book.id, true),
      ]);
      if (request !== version.current) return;
      setBookId(book.id);
      setItems(rows.slice(0, PAGE_SIZE));
      setHasMore(rows.length > PAGE_SIZE);
      setCategories(categoryList);
      setWallets(walletList);
    } catch (cause) {
      if (request === version.current) { setItems([]); setError(cause instanceof Error ? cause.message : 'Riwayat belum dapat dimuat.'); }
    } finally { if (request === version.current) setLoading(false); }
  }, [startDate, endDate, categoryId, walletId, type, search]);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));
  const more = async () => {
    if (moreLock.current || loading || !hasMore || !bookId) return;
    moreLock.current = true;
    setLoadingMore(true);
    setError(null);
    const request = version.current;
    try {
      const rows = await getTransactions(bookId, { startDate: startDate || undefined, endDate: endDate || undefined, categoryId, walletId, type, search, limit: PAGE_SIZE + 1, offset: items.length });
      if (request !== version.current) return;
      setItems((previous) => [...previous, ...rows.slice(0, PAGE_SIZE).filter((row) => !previous.some((item) => item.id === row.id))]);
      setHasMore(rows.length > PAGE_SIZE);
    } catch { if (request === version.current) setError('Transaksi berikutnya belum dapat dimuat. Coba lagi.'); }
    finally { moreLock.current = false; setLoadingMore(false); }
  };
  const chip = (label: string, selected: boolean, onPress: () => void, key = label) => <Pressable key={key} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: selected ? colors.selectionBackground : colors.surface }}><Text style={{ color: selected ? colors.selectionText : colors.text, fontSize: 12 }}>{label}</Text></Pressable>;
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScreenHeader title="Riwayat Transaksi" subtitle={params.title || 'Telusuri seluruh transaksi buku aktif'} action={<Pressable accessibilityRole="button" accessibilityLabel="Tambah transaksi" onPress={() => router.push('/transaction/add')} style={{ padding: 8 }}><Icon name="plus" color="#FFFFFF" size={23} /></Pressable>} />
    <View style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput value={searchDraft} onChangeText={setSearchDraft} onSubmitEditing={() => setSearch(searchDraft.trim())} placeholder="Cari catatan, kategori, atau dompet" placeholderTextColor={colors.textMuted} returnKeyType="search" accessibilityLabel="Cari transaksi" style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: colors.surface, color: colors.text }} />
        <Button title="Cari" size="sm" onPress={() => setSearch(searchDraft.trim())} />
        <Pressable accessibilityRole="button" accessibilityLabel="Tampilkan filter" onPress={() => setFiltersOpen((open) => !open)} style={{ padding: 10 }}><Icon name="filter" color={colors.primary} size={22} /></Pressable>
      </View>
      {filtersOpen && <View style={{ gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {chip('Semua jenis', !type, () => { setType(undefined); setCategoryId(undefined); })}
          {chip('Pengeluaran', type === 'expense', () => { setType('expense'); setCategoryId(undefined); })}
          {chip('Pemasukan', type === 'income', () => { setType('income'); setCategoryId(undefined); })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {chip('Semua kategori', !categoryId, () => setCategoryId(undefined))}
          {categories.filter((category) => !type || category.type === type).map((category) => chip(`${category.name}${!type ? category.type === 'income' ? ' · Masuk' : ' · Keluar' : ''}`, category.id === categoryId, () => setCategoryId(category.id), `category-${category.id}`))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {chip('Semua dompet', !walletId, () => setWalletId(undefined))}
          {wallets.map((wallet) => chip(`${wallet.name}${wallet.is_archived ? ' (arsip)' : ''}`, wallet.id === walletId, () => setWalletId(wallet.id), `wallet-${wallet.id}`))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Text style={{ color: colors.textSecondary, marginBottom: 6 }}>Dari</Text><DatePickerField label="Tanggal awal" value={startDate} onChange={setStartDate} /></View>
          <View style={{ flex: 1 }}><Text style={{ color: colors.textSecondary, marginBottom: 6 }}>Sampai</Text><DatePickerField label="Tanggal akhir" value={endDate} onChange={setEndDate} /></View>
        </View>
        <Button title="Hapus Semua Filter" size="sm" variant="outline" onPress={() => { setStartDate(''); setEndDate(''); setCategoryId(undefined); setWalletId(undefined); setType(undefined); setSearch(''); setSearchDraft(''); }} />
      </View>}
      {(startDate || endDate) && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{startDate ? formatReadableDate(startDate) : 'Awal'} – {endDate ? formatReadableDate(endDate) : 'Tanpa batas akhir'}</Text>}
    </View>
    <FlatList data={loading ? [] : items} keyExtractor={(item) => String(item.id)} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 24 }} refreshing={loading} onRefresh={() => { void load(); }}
      ListEmptyComponent={loading ? <Text style={{ color: colors.textSecondary }}>Memuat transaksi...</Text> : <EmptyState icon="search" title={error ? 'Riwayat Belum Dapat Dimuat' : 'Tidak Ada Transaksi'} subtitle={error || 'Coba ubah pencarian atau filter.'} action={error ? <Button title="Coba Lagi" onPress={() => { void load(); }} /> : undefined} />}
      ListFooterComponent={!loading && items.length > 0 ? <View style={{ gap: 12, paddingTop: 10 }}>
        <Text style={{ color: colors.textMuted, textAlign: 'center' }}>{items.length} transaksi ditampilkan</Text>
        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {hasMore && <Button title="Muat Transaksi Berikutnya" loading={loadingMore} onPress={() => { void more(); }} />}
      </View> : null}
      renderItem={({ item, index }) => <View>
        {(index === 0 || items[index - 1].date !== item.date) && <Text style={{ color: colors.textSecondary, fontWeight: '600', paddingVertical: 10 }}>{formatReadableDate(item.date)}</Text>}
        <Pressable onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface }}>
          <Icon name={item.category_icon} color={item.category_color} size={23} />
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600' }}>{item.note || item.category_name}</Text><Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 5 }}>{item.category_name} · {item.wallet_name}</Text></View>
          <AmountDisplay amount={item.amount} type={item.type} showSign size="sm" />
        </Pressable>
      </View>} />
  </View>;
}
