import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { Radius, Spacing, Typography, type ThemeColors } from '../../constants/theme';
import { useThemedStyles } from '../../hooks/use-theme';
import { DEFAULT_OCR_BATCH_HOST, runOcrBatch, type OcrBatchProgress } from '../../lib/ocrBatch';

const BATCH_AVAILABLE = __DEV__ && Platform.OS === 'android';
const IMAGE_TIMEOUT_MS = 30_000;

type NativeRecognizer = { recognizeText?: (uri: string) => Promise<unknown> };

async function loadNativeRecognizer(): Promise<(uri: string) => Promise<unknown>> {
  try {
    const module: NativeRecognizer & { default?: NativeRecognizer } = await import('expo-mlkit-ocr');
    const recognizer = module.recognizeText ? module : module.default;
    if (recognizer?.recognizeText) return (uri) => recognizer.recognizeText!(uri);
  } catch {
    // The import can fail when the Android APK does not contain the native module.
  }
  throw new Error('Modul OCR belum tersedia. Buka proyek ini lewat APK development KASKUY yang memuat ML Kit, bukan Expo Go.');
}

async function downloadImage(url: string, headers: Record<string, string>): Promise<string> {
  const cachedPath = await Image.getCachePathAsync(url);
  if (cachedPath) return `file://${cachedPath}`;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const downloaded = await Promise.race([
      Image.prefetch(url, { cachePolicy: 'disk', headers }),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), IMAGE_TIMEOUT_MS);
      }),
    ]);
    if (!downloaded) {
      throw new Error('Foto belum dapat diunduh. Periksa Wi-Fi dan runner, lalu coba lagi.');
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  const path = await Image.getCachePathAsync(url);
  if (!path) throw new Error('Foto belum tersedia di cache Android. Coba ulang pengunduhan.');
  return `file://${path}`;
}

function progressText(progress: OcrBatchProgress): string {
  if (progress.phase === 'completed') return 'Batch selesai. Komputer sudah menerima semua hasil.';
  if (progress.phase === 'sending') return `Menyimpan hasil ${progress.currentId} ke komputer…`;
  if (progress.phase === 'downloading') return `Mengunduh foto ${progress.currentId}…`;
  return `Membaca ${progress.currentId}…`;
}

export default function BatchOcrScreen() {
  const { token: deepLinkToken, host: deepLinkHost } = useLocalSearchParams<{ token?: string; host?: string }>();
  const routeToken = typeof deepLinkToken === 'string' ? deepLinkToken : '';
  const routeHost = typeof deepLinkHost === 'string' ? deepLinkHost : DEFAULT_OCR_BATCH_HOST;
  const [enteredHost, setEnteredHost] = useState<string | null>(null);
  const [enteredToken, setEnteredToken] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrBatchProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const starting = useRef(false);
  const autoStarted = useRef<string | null>(null);
  const styles = useThemedStyles(createStyles);
  const host = enteredHost ?? routeHost;
  const token = enteredToken ?? routeToken;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const start = useCallback(async (value: string, computerHost: string) => {
    if (!BATCH_AVAILABLE || starting.current) return;
    starting.current = true;
    setError(null);
    setProgress(null);
    setBusy(true);
    try {
      const recognizeText = await loadNativeRecognizer();
      await runOcrBatch({
        host: computerHost.trim(),
        token: value.trim(),
        recognizeText,
        downloadImage,
        onProgress: (next) => { if (mounted.current) setProgress(next); },
      });
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Batch tidak dapat dilanjutkan.');
      }
    } finally {
      starting.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!BATCH_AVAILABLE || !routeToken) return;
    const timer = setTimeout(() => {
      const routeKey = `${routeHost}/${routeToken}`;
      if (autoStarted.current === routeKey) return;
      autoStarted.current = routeKey;
      void start(routeToken, routeHost);
    }, 0);
    return () => clearTimeout(timer);
  }, [routeHost, routeToken, start]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Uji Batch OCR" back={!busy} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!BATCH_AVAILABLE ? (
          <Card><Text style={styles.text}>Penguji batch tersedia pada development build Android.</Text></Card>
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={styles.text}>Masukkan IP dan token yang ditampilkan runner batch di komputer.</Text>
              <Text style={styles.label}>IP komputer</Text>
              <TextInput
                accessibilityLabel="IP komputer"
                value={host}
                onChangeText={setEnteredHost}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                selectTextOnFocus
                style={styles.input}
              />
              <Text style={styles.label}>Token batch</Text>
              <TextInput
                accessibilityLabel="Token batch"
                value={token}
                onChangeText={setEnteredToken}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.input}
              />
              <Button
                title={error ? 'Coba lagi' : 'Jalankan batch'}
                loading={busy}
                disabled={!host.trim() || !token.trim()}
                onPress={() => { void start(token, host); }}
              />
            </Card>
            {(progress || busy || error) && (
              <Card style={styles.card} accessibilityLiveRegion="polite">
                {progress && (
                  <>
                    <Text style={styles.count}>{progress.completed} / {progress.total} hasil tersimpan</Text>
                    <Text style={styles.text}>{progressText(progress)}</Text>
                    <Text style={styles.text}>{progress.errors} gambar gagal pada sesi ini</Text>
                  </>
                )}
                {busy && !progress && <Text style={styles.text}>Menghubungkan ke runner batch…</Text>}
                {error && <Text style={styles.error}>{error}</Text>}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, gap: Spacing.lg },
  card: { gap: Spacing.md },
  text: { ...Typography.body, color: colors.textSecondary },
  label: { ...Typography.subtitle, color: colors.text },
  count: { ...Typography.title, color: colors.text },
  error: { ...Typography.body, color: colors.danger },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    minHeight: 46,
    color: colors.text,
  },
});
