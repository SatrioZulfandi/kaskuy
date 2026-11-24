import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Typography, type ThemeColors } from '../../constants/theme';
import { getTransactionsForExport, type RestoredBook } from '../../db/repositories/backupRepo';
import { getDefaultBook, setDefaultBook } from '../../db/repositories/bookRepo';
import {
  createSqliteBackup, createSqliteBackupFile, inspectSqliteBackup, inspectSqliteBackupFile,
  restoreSqliteBackup, restoreSqliteBackupFile, type SqliteBackupPreview,
} from '../../db/repositories/sqliteBackupRepo';
import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { useTopInset } from '../../hooks/useTopInset';
import { getTodayDateString } from '../../lib/date';
import { disposeBackupFile, pickBackupFile, saveDataFile, SQLITE_MIME_TYPE, type BackupInput } from '../../lib/portabilityFiles';
import { buildTransactionsXlsx, XLSX_MIME_TYPE } from '../../lib/transactionsXlsx';
import type { Book } from '../../types';

type DataAction = 'excel' | 'save' | 'pick' | 'restore' | 'open';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba lagi.';
}

function fileTimestamp(): string {
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, '0')).join('-');
  return `${getTodayDateString()} ${time}`;
}

function formatBackupDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function ManageDataScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const [book, setBook] = useState<Book | null>(null);
  const [action, setAction] = useState<DataAction | null>(null);
  const [review, setReview] = useState<SqliteBackupPreview | null>(null);
  const [restoredBooks, setRestoredBooks] = useState<RestoredBook[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const working = useRef(false);
  const selectedInput = useRef<BackupInput | null>(null);
  const busy = action !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!working.current) {
        disposeBackupFile(selectedInput.current);
        selectedInput.current = null;
      }
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getDefaultBook().then((current) => {
      if (active) setBook(current);
    }).catch((reason: unknown) => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, []));

  const run = async (nextAction: DataAction, work: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setAction(nextAction);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (reason) {
      if (mounted.current) setError(message(reason));
    } finally {
      working.current = false;
      if (mounted.current) {
        setAction(null);
        setProgress(null);
      } else {
        disposeBackupFile(selectedInput.current);
        selectedInput.current = null;
      }
    }
  };

  const save = (kind: 'excel' | 'save') => run(kind, async () => {
    const timestamp = fileTimestamp();
    const filename = kind === 'excel' ? `Transaksi KASKUY - ${timestamp}.xlsx` : `Cadangan KASKUY - ${timestamp}.sqlite`;
    if (kind === 'excel' && !book) throw new Error('Pilih buku aktif terlebih dahulu.');
    const saved = kind === 'excel' && book
      ? await saveDataFile(filename, XLSX_MIME_TYPE, {
        bytes: async () => buildTransactionsXlsx((await getTransactionsForExport(book.id)).transactions),
      })
      : await saveDataFile(filename, SQLITE_MIME_TYPE, {
        bytes: createSqliteBackup,
        writeToCache: createSqliteBackupFile,
      });
    if (saved && mounted.current) {
      setNotice(Platform.OS === 'web' ? `Unduhan ${filename} dimulai.` : `${filename} tersimpan di folder yang dipilih.`);
    }
  });

  const clearReview = () => {
    disposeBackupFile(selectedInput.current);
    selectedInput.current = null;
    setReview(null);
  };

  const chooseBackup = () => run('pick', async () => {
    clearReview();
    const input = await pickBackupFile();
    if (!input) return;
    try {
      if (!mounted.current) return;
      const summary = input.kind === 'sqlite-file'
        ? await inspectSqliteBackupFile(input.filename, input.directory)
        : await inspectSqliteBackup(input.bytes);
      if (mounted.current) {
        selectedInput.current = input;
        setReview(summary);
        setRestoredBooks(null);
      }
    } finally {
      if (selectedInput.current !== input) disposeBackupFile(input);
    }
  });

  const restore = () => run('restore', async () => {
    const input = selectedInput.current;
    if (!input) return;
    const reportProgress = (completed: number, total: number) => {
      if (mounted.current) setProgress(total > 0 ? Math.floor(completed / total * 100) : 0);
    };
    const result = input.kind === 'sqlite-file'
      ? await restoreSqliteBackupFile(input.filename, input.directory, reportProgress)
      : await restoreSqliteBackup(input.bytes, reportProgress);
    if (mounted.current) {
      clearReview();
      setRestoredBooks(result.restoredBooks);
      setNotice(`${result.books} buku, ${result.wallets} dompet, ${result.transactions} transaksi, dan ${result.budgets} anggaran berhasil dipulihkan.`);
    }
  });

  const openRestored = () => {
    if (restoredBooks?.length !== 1) {
      router.push('/manage/books');
      return;
    }
    void run('open', async () => {
      await setDefaultBook(restoredBooks[0].id);
      if (mounted.current) router.dismissTo('/(tabs)');
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <LinearGradient variant="header" colors={[colors.gradientStart, colors.gradientEnd]} style={[styles.header, { paddingTop: topInset }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Kembali" style={styles.backButton}>
            <Icon name="chevLeft" color="#FFFFFF" size={22} />
          </Pressable>
          <Text style={styles.headerTitle}>Ekspor &amp; Cadangan</Text>
        </View>
        <Text style={styles.headerSubtitle}>Simpan transaksi atau pulihkan data keuangan</Text>
      </LinearGradient>
      <ScrollView style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
        {restoredBooks ? (
          <Button title={restoredBooks.length === 1 ? 'Buka Buku Pulihan' : 'Pilih Buku di Kelola Buku'}
            disabled={busy} loading={action === 'open'} onPress={openRestored} />
        ) : null}
        <View style={styles.card}>
          <Text style={styles.title}>Ekspor Transaksi</Text>
          <Text style={styles.description}>
            {book ? `Simpan seluruh transaksi dari buku ${book.name} sebagai file Excel.` : 'Simpan seluruh transaksi buku aktif sebagai file Excel.'}
          </Text>
          <Button title="Ekspor ke Excel" variant="secondary" disabled={busy || !book}
            loading={action === 'excel'} onPress={() => { void save('excel'); }} />
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Cadangkan Semua Buku</Text>
          <Text style={styles.description}>Simpan buku, dompet dan saldo, kategori, transaksi, serta anggaran untuk dipulihkan nanti.</Text>
          {Platform.OS === 'android' ? <Text style={styles.description}>Pilih folder seperti Dokumen. Untuk pindah HP, Anda bisa memindahkan file cadangan ke Google Drive dari aplikasi File.</Text> : null}
          <Button title="Simpan Cadangan" variant="secondary" disabled={busy}
            loading={action === 'save'} onPress={() => { void save('save'); }} />
        </View>
        <View style={styles.card}>
          <Text style={styles.title}>Pulihkan Cadangan</Text>
          <Text style={styles.description}>Pilih file cadangan KASKUY (.sqlite) dan periksa isinya sebelum memulihkan data ke buku baru.</Text>
          <Button title="Pilih File Cadangan" variant="secondary" disabled={busy}
            loading={action === 'pick'} onPress={() => { void chooseBackup(); }} />
          {review ? (
            <View style={styles.review}>
              <Text style={styles.title}>Cadangan {formatBackupDate(review.createdAt)}</Text>
              <Text style={styles.description}>
                {review.books.length} buku · {review.walletCount} dompet · {review.transactionCount} transaksi · {review.budgetCount} anggaran
              </Text>
              <Text style={styles.description}>{review.books.map((item) => item.name).join(', ')}</Text>
              {progress !== null ? (
                <Text accessibilityLiveRegion="polite" style={styles.description}>
                  Memulihkan data… {progress}%
                </Text>
              ) : null}
              <Button title="Pulihkan Data" disabled={busy} loading={action === 'restore'}
                onPress={() => { void restore(); }} />
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
  review: { gap: 12, padding: 12, borderRadius: Radius.sm, backgroundColor: colors.background },
});
