import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Typography, type ThemeColors } from '../../constants/theme';
import { createFinancialBackup, exportTransactionsCsv, restoreFinancialBackup } from '../../db/repositories/backupRepo';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { useTopInset } from '../../hooks/useTopInset';
import { getTodayDateString } from '../../lib/date';
import { MAX_BACKUP_LENGTH, parseFinancialBackup } from '../../lib/dataPortability';
import type { FinancialBackup } from '../../lib/dataPortability';
import type { Book } from '../../types';

type ExportData = { kind: 'csv' | 'json'; content: string; filename: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba lagi.';
}

export default function ManageDataScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const [book, setBook] = useState<Book | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [showFullExport, setShowFullExport] = useState(false);
  const [importText, setImportText] = useState('');
  const [review, setReview] = useState<FinancialBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const working = useRef(false);
  const focused = useRef(false);
  const generation = useRef(0);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    generation.current++;
    setBusy(working.current);
    let active = true;
    void getDefaultBook().then((current) => {
      if (active) {
        setBook(current);
        setExportData(null);
        if (!current) setError('Buku aktif tidak ditemukan.');
      }
    }).catch((reason: unknown) => { if (active) setError(message(reason)); });
    return () => { active = false; focused.current = false; generation.current++; };
  }, []));

  const generateExport = async (kind: 'csv' | 'json') => {
    if (working.current) return;
    const request = generation.current;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const current = await getDefaultBook();
      if (!current) throw new Error('Pilih buku aktif terlebih dahulu.');
      const content = kind === 'csv' ? await exportTransactionsCsv(current.id) : await createFinancialBackup();
      if (focused.current && request === generation.current) {
        setBook(current);
        setShowFullExport(false);
        setExportData({ kind, content, filename: `kaskuy-${kind === 'csv' ? `transaksi-${current.id}` : 'cadangan'}-${getTodayDateString()}.${kind}` });
      }
    } catch (reason) {
      if (focused.current && request === generation.current) setError(message(reason));
    } finally {
      working.current = false;
      if (focused.current) setBusy(false);
    }
  };

  const shareExport = async () => {
    if (!exportData || working.current) return;
    const request = generation.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await Share.share({ title: exportData.filename, message: exportData.content }, { dialogTitle: `Bagikan ${exportData.filename}` });
    } catch (reason) {
      if (focused.current && request === generation.current) setError(`${message(reason)} Anda juga dapat menyalin teks pratinjau.`);
    } finally {
      working.current = false;
      if (focused.current) setBusy(false);
    }
  };

  const downloadExport = () => {
    if (!exportData || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const blob = new Blob([exportData.content], { type: exportData.kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportData.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const inspectBackup = () => {
    if (working.current) return;
    setError(null);
    setNotice(null);
    try {
      setReview(parseFinancialBackup(importText));
    } catch (reason) {
      setReview(null);
      setError(message(reason));
    }
  };

  const restoreBackup = async () => {
    if (!review || working.current) return;
    const request = generation.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await restoreFinancialBackup(importText);
      if (focused.current && request === generation.current) {
        setImportText('');
        setReview(null);
        setExportData(null);
        setNotice(`${result.books} buku, ${result.wallets} dompet, ${result.transactions} transaksi, dan ${result.budgets} budget berhasil dipulihkan. Pilih buku hasil pemulihan melalui Kelola Buku.`);
      }
    } catch (reason) {
      if (focused.current && request === generation.current) setError(message(reason));
    } finally {
      working.current = false;
      if (focused.current) setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <LinearGradient variant="header" colors={[colors.gradientStart, colors.gradientEnd]} style={[styles.header, { paddingTop: topInset }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Kembali" style={styles.backButton}>
            <Icon name="chevLeft" color="#FFFFFF" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Ekspor & Cadangan</Text>
        </View>
        <Text style={styles.headerSubtitle}>Simpan salinan data dan pulihkan ke buku baru</Text>
      </LinearGradient>
      <ScrollView style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="alert" style={styles.success}>{notice}</Text> : null}
        <View style={styles.card}>
          <Text style={styles.title}>Ekspor Transaksi CSV</Text>
          <Text style={styles.description}>Seluruh transaksi buku aktif: {book?.name || 'memuat...'}. Cocok untuk dibuka di aplikasi spreadsheet.</Text>
          <Button title="Siapkan CSV" variant="secondary" disabled={busy || !book} onPress={() => { void generateExport('csv'); }} />
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Cadangan Semua Buku</Text>
          <Text style={styles.description}>Cadangan JSON memuat buku, dompet, saldo, kategori, transaksi, dan budget. Foto struk, hasil OCR, serta preferensi tampilan tidak disertakan.</Text>
          <Button title="Siapkan Cadangan JSON" variant="secondary" disabled={busy} onPress={() => { void generateExport('json'); }} />
        </View>
        {exportData ? (
          <View style={styles.card}>
            <Text style={styles.title}>{exportData.filename}</Text>
            <Text style={styles.description}>
              {Platform.OS === 'web' ? 'Unduh berkas atau bagikan teksnya.' : 'Bagikan sebagai teks, lalu simpan melalui aplikasi pilihan Anda. Teks juga dapat dipilih dan disalin di bawah.'}
            </Text>
            <Button title={exportData.kind === 'csv' ? 'Bagikan CSV' : 'Bagikan Cadangan JSON'} disabled={busy} loading={busy} onPress={() => { void shareExport(); }} />
            {Platform.OS === 'web' ? <Button title="Unduh Berkas" variant="outline" disabled={busy} onPress={downloadExport} /> : null}
            <ScrollView style={styles.preview} nestedScrollEnabled>
              <Text selectable style={styles.code}>{showFullExport ? exportData.content : exportData.content.slice(0, 5000)}</Text>
            </ScrollView>
            {exportData.content.length > 5000 ? (
              <Button title={showFullExport ? 'Ringkas Pratinjau' : 'Tampilkan Semua Teks untuk Disalin'} variant="outline" size="sm" onPress={() => setShowFullExport(!showFullExport)} />
            ) : null}
          </View>
        ) : null}
        <View style={styles.card}>
          <Text style={styles.title}>Pulihkan Cadangan JSON</Text>
          <Text style={styles.description}>Tempel isi cadangan lengkap. Data ditambahkan sebagai buku baru bertanda “Pemulihan”; data dan buku aktif saat ini tetap tersedia.</Text>
          <TextInput
            accessibilityLabel="Isi cadangan JSON"
            value={importText}
            onChangeText={(value) => { setImportText(value); setReview(null); }}
            editable={!busy}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={MAX_BACKUP_LENGTH}
            placeholder="Tempel JSON cadangan Kaskuy di sini"
            placeholderTextColor={colors.textMuted}
            style={styles.importInput}
          />
          <Button title="Periksa Cadangan" variant="outline" disabled={busy || !importText.trim()} onPress={inspectBackup} />
          {review ? (
            <View style={styles.review}>
              <Text style={styles.title}>Cadangan Valid</Text>
              <Text style={styles.description}>{review.books.length} buku · {review.wallets.length} dompet · {review.transactions.length} transaksi · {review.budgets.length} budget</Text>
              <Text style={styles.description}>Buku: {review.books.map((item) => item.name).join(', ')}</Text>
              <Button title="Pulihkan sebagai Buku Baru" disabled={busy} loading={busy} onPress={() => { void restoreBackup(); }} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.gradientStart },
  header: { paddingHorizontal: 20, paddingBottom: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', ...Typography.title },
  headerSubtitle: { color: '#FFFFFF', fontSize: 13, marginTop: 5 },
  body: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  card: { backgroundColor: colors.surface, borderRadius: Radius.lg, padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  error: { color: colors.danger, backgroundColor: colors.dangerLight, padding: 14, borderRadius: Radius.sm },
  success: { color: colors.text, backgroundColor: colors.successLight, padding: 14, borderRadius: Radius.sm, lineHeight: 20 },
  preview: { maxHeight: 230, padding: 12, backgroundColor: colors.background, borderRadius: Radius.sm },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: colors.text, lineHeight: 17 },
  importInput: { minHeight: 170, maxHeight: 300, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.sm, padding: 12, textAlignVertical: 'top', color: colors.text, fontSize: 12 },
  review: { gap: 12, paddingTop: 8 },
});
