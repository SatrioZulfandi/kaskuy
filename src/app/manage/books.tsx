import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, type ThemeColors } from '../../constants/theme';
import { createBook, deleteBook, getAllBooks, setDefaultBook, updateBook } from '../../db/repositories/bookRepo';
import { useTopInset } from '../../hooks/useTopInset';
import type { Book } from '../../types';

export default function ManageBooksScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const [books, setBooks] = useState<Book[]>([]);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef(false);
  const loadVersion = useRef(0);
  const phase = useRef<'idle' | 'confirming' | 'working'>('idle');

  const loadBooks = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const list = await getAllBooks();
      if (focused.current && version === loadVersion.current) setBooks(list);
    } catch {
      if (focused.current && version === loadVersion.current) setError('Buku keuangan belum dapat dimuat. Silakan coba lagi.');
    } finally {
      if (focused.current && version === loadVersion.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(phase.current === 'working');
    void loadBooks();
    return () => {
      focused.current = false;
      loadVersion.current++;
    };
  }, [loadBooks]));

  const mutate = async (operation: () => Promise<unknown>, clearNewName = false) => {
    if (phase.current !== 'idle') return;
    phase.current = 'working';
    setBusy(true);
    try {
      await operation();
      if (focused.current) {
        if (clearNewName) setNewName('');
        setEditingId(null);
        await loadBooks();
      }
    } catch (err: unknown) {
      if (focused.current) Alert.alert('Perubahan Belum Disimpan', err instanceof Error ? err.message : 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      phase.current = 'idle';
      if (focused.current) setBusy(false);
    }
  };

  const confirmDelete = (book: Book) => {
    if (phase.current !== 'idle') return;
    phase.current = 'confirming';
    const dismiss = () => { if (phase.current === 'confirming') phase.current = 'idle'; };
    Alert.alert('Hapus Buku', `Hapus buku “${book.name}”? Hanya buku nonaktif tanpa transaksi, budget, dan saldo yang dapat dihapus.`, [
      { text: 'Batal', style: 'cancel', onPress: dismiss },
      { text: 'Hapus', style: 'destructive', onPress: () => {
        if (phase.current !== 'confirming' || !focused.current) { dismiss(); return; }
        phase.current = 'idle';
        void mutate(() => deleteBook(book.id));
      } },
    ], { cancelable: true, onDismiss: dismiss });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <LinearGradient style={[styles.header, { paddingTop: topInset }]}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={styles.backButton}>
            <Icon name="chevLeft" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Buku Keuangan</Text>
        </View>
        <Text style={styles.headerSubtitle}>Pisahkan catatan pribadi, keluarga, atau usaha.</Text>
      </LinearGradient>

      <ScrollView style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tambah Buku</Text>
          <TextInput accessibilityLabel="Nama buku baru" placeholder="Contoh: Keuangan Keluarga" placeholderTextColor={colors.textMuted}
            value={newName} onChangeText={setNewName} maxLength={60} editable={!busy} style={styles.input} />
          <Button title="Tambah Buku" onPress={() => { void mutate(() => createBook(newName), true); }} disabled={busy || !newName.trim()} loading={busy} />
          <Text style={styles.hint}>Buku baru mendapat satu dompet Uang Tunai dengan saldo Rp0. Kategori digunakan bersama di semua buku.</Text>
        </View>

        <Text style={styles.sectionTitle}>Daftar Buku ({books.length})</Text>
        {loading ? <Text style={styles.hint}>Memuat buku...</Text> : error ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Button title="Coba Lagi" variant="outline" onPress={() => { void loadBooks(); }} />
          </View>
        ) : books.map((book) => (
          <View key={book.id} style={[styles.card, book.is_default === 1 && styles.activeCard]}>
            <View style={styles.bookTitleRow}>
              <View style={styles.bookIcon}><Icon name="wallet" size={23} color={colors.primary} /></View>
              <View style={styles.bookText}>
                <Text style={styles.bookName}>{book.name}</Text>
                <Text style={styles.hint}>{book.is_default === 1 ? 'Buku aktif' : 'Buku nonaktif'}</Text>
              </View>
              {book.is_default === 1 && <Icon name="check" size={22} color={colors.primary} />}
            </View>
            {editingId === book.id ? (
              <>
                <TextInput accessibilityLabel="Ubah nama buku" value={editName} onChangeText={setEditName} maxLength={60}
                  editable={!busy} style={styles.input} />
                <View style={styles.actions}>
                  <Button title="Batal" size="sm" variant="outline" disabled={busy} onPress={() => setEditingId(null)} />
                  <Button title="Simpan Nama" size="sm" disabled={busy || !editName.trim()} onPress={() => { void mutate(() => updateBook(book.id, editName)); }} />
                </View>
              </>
            ) : (
              <View style={styles.actions}>
                {book.is_default !== 1 && <Button title="Aktifkan" size="sm" disabled={busy} onPress={() => { void mutate(() => setDefaultBook(book.id)); }} />}
                <Button title="Ubah Nama" size="sm" variant="outline" disabled={busy} onPress={() => { setEditingId(book.id); setEditName(book.name); }} />
                {book.is_default !== 1 && <Button title="Hapus" size="sm" variant="danger" disabled={busy} onPress={() => confirmDelete(book)} />}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.primaryDark },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', flex: 1 },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 10, lineHeight: 18 },
  body: { flex: 1, backgroundColor: colors.background, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, marginTop: -12 },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  card: { backgroundColor: colors.surface, borderRadius: Radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.borderLight },
  activeCard: { borderColor: colors.primary },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 12, paddingVertical: 12, borderRadius: Radius.sm, fontSize: 15 },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  bookTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bookIcon: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  bookText: { flex: 1, gap: 3 },
  bookName: { fontSize: 16, fontWeight: '600', color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
