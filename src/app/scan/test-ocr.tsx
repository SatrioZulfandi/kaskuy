// src/app/scan/test-ocr.tsx
// Layar pengujian OCR struk lama (dipertahankan untuk referensi)
import * as ImagePicker from 'expo-image-picker';
import * as OcrModule from 'expo-mlkit-ocr';
import React, { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../components/ui/Button';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { Radius, Spacing, Typography, type ThemeColors } from '../../constants/theme';
import { useThemedStyles } from '../../hooks/use-theme';
import { type ParsedReceipt, parseReceipt } from '../../lib/parseReceipt';
import { readReceiptOcr } from '../../lib/receiptOcr';

const ocr: any = (OcrModule as any).recognizeText
  ? OcrModule
  : (OcrModule as any).default;

function rupiah(n: number | null): string {
  if (n === null) return '-';
  return 'Rp ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function Row({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function TestOcrScreen() {
  const styles = useThemedStyles(createStyles);
  const [uri, setUri] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pickAndRead() {
    setError('');
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
    if (res.canceled) return;

    const imageUri = res.assets[0].uri;
    setUri(imageUri);
    setText('');
    setParsed(null);
    setMs(null);
    setBusy(true);
    try {
      const start = Date.now();
      const result = await ocr.recognizeText(imageUri);
      setMs(Date.now() - start);
      const { rawText, reconstructedLines } = readReceiptOcr(result);
      setText(rawText);
      setParsed(parseReceipt(rawText, { reconstructedLines }));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Uji OCR Struk" />
      <ScrollView contentContainerStyle={styles.content}>
        <Button
          title={busy ? 'Membaca...' : 'Pilih foto struk'}
          onPress={() => { void pickAndRead(); }}
          loading={busy}
        />

        {uri && <Image source={{ uri }} style={styles.image} resizeMode="contain" />}
        {ms !== null && <Text style={styles.label}>Waktu proses OCR: {ms} ms</Text>}
        {error !== '' && <Text style={[styles.status, styles.error]}>Error: {error}</Text>}

        {parsed && (
          <View style={styles.box}>
            <Text style={styles.sectionTitle}>Hasil parser</Text>
            <Row label="Merchant" value={parsed.merchant ?? '-'} styles={styles} />
            <Row label="Tanggal" value={parsed.date ?? '-'} styles={styles} />
            <Row label="Total" value={rupiah(parsed.total)} styles={styles} />
            <Row label="Tunai" value={rupiah(parsed.tunai)} styles={styles} />
            <Row label="Kembali" value={rupiah(parsed.kembali)} styles={styles} />
            <Text style={[styles.status, parsed.needsConfirmation ? styles.warn : styles.ok]}>
              {parsed.needsConfirmation
                ? `Perlu dicek pengguna (keyakinan: ${parsed.confidence})`
                : 'Data konsisten (keyakinan: tinggi)'}
            </Text>
            {parsed.notes.map((n, i) => (
              <Text key={i} style={styles.note}>
                - {n}
              </Text>
            ))}
          </View>
        )}

        {text !== '' && (
          <View style={styles.box}>
            <Text style={styles.label}>Teks mentah hasil OCR (tekan lama untuk menyalin)</Text>
            <Text selectable style={styles.result}>{text}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.xl, paddingBottom: Spacing.xxxl, gap: Spacing.lg },
  image: {
    width: '100%',
    height: 300,
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
  },
  box: { backgroundColor: colors.surface, padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.sm },
  sectionTitle: { ...Typography.subtitle, color: colors.text },
  label: { color: colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  rowValue: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  status: {
    ...Typography.body,
    color: colors.text,
    borderRadius: Radius.xs,
    borderLeftWidth: 3,
    padding: Spacing.sm,
  },
  error: { backgroundColor: colors.dangerLight, borderLeftColor: colors.danger },
  ok: { backgroundColor: colors.successLight, borderLeftColor: colors.success },
  warn: { backgroundColor: colors.warningLight, borderLeftColor: colors.warning },
  note: { ...Typography.caption, color: colors.textSecondary },
  result: { color: colors.text, fontFamily: 'monospace' },
});

