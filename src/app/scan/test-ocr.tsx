// src/app/scan/test-ocr.tsx
// Layar pengujian OCR struk lama (dipertahankan untuk referensi)
import * as ImagePicker from 'expo-image-picker';
import * as OcrModule from 'expo-mlkit-ocr';
import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { type ParsedReceipt, parseReceipt } from '../../lib/parseReceipt';

const ocr: any = (OcrModule as any).recognizeText
  ? OcrModule
  : (OcrModule as any).default;

function rupiah(n: number | null): string {
  if (n === null) return '-';
  return 'Rp ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export default function TestOcrScreen() {
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
      const t: string = result?.text ?? JSON.stringify(result, null, 2);
      setText(t);
      setParsed(parseReceipt(t));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Uji OCR Struk</Text>
      <Pressable style={s.button} onPress={pickAndRead} disabled={busy}>
        <Text style={s.buttonText}>
          {busy ? 'Membaca...' : 'Pilih foto struk'}
        </Text>
      </Pressable>

      {uri && <Image source={{ uri }} style={s.image} resizeMode="contain" />}
      {ms !== null && <Text style={s.info}>Waktu proses OCR: {ms} ms</Text>}
      {error !== '' && <Text style={s.error}>Error: {error}</Text>}

      {parsed && (
        <View style={s.box}>
          <Text style={s.label}>Hasil parser:</Text>
          <Row label="Merchant" value={parsed.merchant ?? '-'} />
          <Row label="Tanggal" value={parsed.date ?? '-'} />
          <Row label="Total" value={rupiah(parsed.total)} />
          <Row label="Tunai" value={rupiah(parsed.tunai)} />
          <Row label="Kembali" value={rupiah(parsed.kembali)} />
          <Text style={parsed.needsConfirmation ? s.warn : s.ok}>
            {parsed.needsConfirmation
              ? `Perlu dicek pengguna (keyakinan: ${parsed.confidence})`
              : 'Data konsisten (keyakinan: tinggi)'}
          </Text>
          {parsed.notes.map((n, i) => (
            <Text key={i} style={s.note}>
              - {n}
            </Text>
          ))}
        </View>
      )}

      {text !== '' && (
        <View style={s.box}>
          <Text style={s.label}>
            Teks mentah hasil OCR (tekan lama untuk menyalin):
          </Text>
          <Text selectable style={s.result}>
            {text}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 20, paddingTop: 60, gap: 14 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700' },
  button: {
    backgroundColor: '#2f7df6',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  image: {
    width: '100%',
    height: 300,
    backgroundColor: '#222',
    borderRadius: 8,
  },
  info: { color: '#9ad' },
  error: { color: '#f66' },
  box: { backgroundColor: '#1d1d1d', padding: 12, borderRadius: 8, gap: 6 },
  label: { color: '#aaa', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: '#aaa' },
  rowValue: { color: '#fff', fontWeight: '600' },
  ok: { color: '#6c6', marginTop: 6 },
  warn: { color: '#fb4', marginTop: 6 },
  note: { color: '#bbb', fontSize: 12 },
  result: { color: '#fff', fontFamily: 'monospace' },
});

