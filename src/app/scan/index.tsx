// src/app/scan/index.tsx
import * as ImagePicker from 'expo-image-picker';
import * as OcrModule from 'expo-mlkit-ocr';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BatikPattern } from '../../components/decorative/BatikPattern';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Colors, Radius, Typography } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { learnMerchantCorrection } from '../../db/repositories/merchantDictRepo';
import { recordCorrection } from '../../db/repositories/ocrCorrectionRepo';
import { createScanResult, markScanResultCorrected } from '../../db/repositories/scanResultRepo';
import { createTransaction } from '../../db/repositories/transactionRepo';
import { getWallets } from '../../db/repositories/walletRepo';
import { formatRupiah } from '../../lib/currency';
import { getTodayDateString } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';
import { type ParsedReceipt, parseReceipt } from '../../lib/parseReceipt';
import type { Category, Wallet } from '../../types';

const ocr: any = (OcrModule as any).recognizeText
  ? OcrModule
  : (OcrModule as any).default;

export default function ScanScreen() {
  const topInset = useTopInset(12);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResultId, setScanResultId] = useState<number | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [durationMs, setDurationMs] = useState<number>(0);

  // Form states for confirmation
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const initOptions = async () => {
    try {
      const book = await getDefaultBook();
      if (!book) return;
      const wList = await getWallets(book.id);
      setWallets(wList);
      if (wList.length > 0) setSelectedWalletId(wList[0].id);

      const cList = await getCategories('expense');
      setCategories(cList);
      // Default to "Belanja" or first expense category
      const defaultCat = cList.find((c) => c.name.toLowerCase() === 'belanja') || cList[0];
      if (defaultCat) setSelectedCategoryId(defaultCat.id);
    } catch (err) {
      console.error('Failed to init options:', err);
    }
  };

  const processImage = async (uri: string) => {
    setImageUri(uri);
    setIsProcessing(true);
    await initOptions();

    const start = Date.now();
    try {
      const result = await ocr.recognizeText(uri);
      const ms = Date.now() - start;
      setDurationMs(ms);

      const rawText: string = result?.text ?? JSON.stringify(result, null, 2);
      const parsedData = parseReceipt(rawText);
      setParsed(parsedData);

      // Populate form
      setMerchant(parsedData.merchant || '');
      setTotal(parsedData.total ? String(parsedData.total) : '');
      if (parsedData.date) setDate(parsedData.date);
      setNote(parsedData.merchant ? `Belanja di ${parsedData.merchant}` : 'Scan Struk');

      // Save initial scan result to database (for audit and research tracking)
      const record = await createScanResult({
        image_uri: uri,
        raw_ocr_text: rawText,
        reconstructed_lines: JSON.stringify(result?.blocks || []),
        parsed_data: JSON.stringify(parsedData),
        confidence: parsedData.confidence,
        needs_confirmation: parsedData.needsConfirmation ? 1 : 0,
        ocr_duration_ms: ms,
      });
      setScanResultId(record.id);

      Haptics.notificationAsync(
        parsedData.confidence === 'high'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    } catch (err: any) {
      Alert.alert('Gagal Memproses OCR', err?.message || 'Pastikan foto struk jelas.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      };

      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (!res.canceled && res.assets[0]?.uri) {
        processImage(res.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Gagal membuka kamera/galeri');
    }
  };

  const handleSaveTransaction = async () => {
    if (!total || isNaN(Number(total)) || Number(total) <= 0) {
      Alert.alert('Nominal Tidak Valid', 'Mohon isi total nominal belanja yang benar.');
      return;
    }
    if (!selectedWalletId || !selectedCategoryId) {
      Alert.alert('Data Belum Lengkap', 'Pilih dompet dan kategori pengeluaran.');
      return;
    }

    setIsSaving(true);
    try {
      const book = await getDefaultBook();
      if (!book) return;

      const numTotal = Number(total);

      // Check if user corrected the parsed data (for adaptive learning & research tracking)
      if (parsed && scanResultId) {
        let corrected = false;
        if (parsed.merchant !== merchant) {
          await recordCorrection(scanResultId, 'merchant', parsed.merchant, merchant);
          // Adaptive Dictionary Learning: learn this correction for future scans!
          if (merchant.trim()) {
            await learnMerchantCorrection(parsed.merchant || merchant, merchant);
          }
          corrected = true;
        }

        if (parsed.total !== numTotal) {
          await recordCorrection(
            scanResultId,
            'total',
            parsed.total ? String(parsed.total) : null,
            String(numTotal)
          );
          corrected = true;
        }

        if (corrected) {
          await markScanResultCorrected(
            scanResultId,
            JSON.stringify({ merchant, total: numTotal, date, note })
          );
        }
      }

      // Create transaction
      await createTransaction({
        book_id: book.id,
        wallet_id: selectedWalletId,
        category_id: selectedCategoryId,
        type: 'expense',
        amount: numTotal,
        note: note.trim() || `Struk ${merchant || 'Belanja'}`,
        date,
        scan_result_id: scanResultId,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Berhasil Disimpan', 'Transaksi struk berhasil dicatat ke dompet Anda.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      {/* Header */}
      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.gradientStart, Colors.light.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <BatikPattern opacity={0.07} color="#FFFFFF" />
          <View style={styles.topRow}>
            <Pressable onPress={() => router.back()} style={styles.navCloseBtn}>
              <Icon name="close" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.screenTitle}>Scan Struk Belanja</Text>
            <View style={{ width: 34 }} />
          </View>
          <Text style={styles.screenSubtitle}>
            Ekstraksi otomatis on-device dengan koreksi Levenshtein
          </Text>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={styles.scrollContent}>
        {/* State 1: Belum ada gambar */}
        {!imageUri && !isProcessing && (
          <View style={styles.introWrap}>
            <View style={styles.actionButtonsRow}>
              <Pressable
                onPress={() => pickImage('camera')}
                style={({ pressed }) => [
                  styles.captureCard,
                  pressed && styles.captureCardPressed,
                ]}
              >
                <View style={[styles.captureIconWrap, { backgroundColor: '#EBF3FF' }]}>
                  <Icon name="camera" size={32} color={Colors.light.primary} />
                </View>
                <Text style={styles.captureTitle}>Foto Kamera</Text>
                <Text style={styles.captureDesc}>Ambil foto struk langsung</Text>
              </Pressable>

              <Pressable
                onPress={() => pickImage('gallery')}
                style={({ pressed }) => [
                  styles.captureCard,
                  pressed && styles.captureCardPressed,
                ]}
              >
                <View style={[styles.captureIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Icon name="scan" size={32} color={Colors.light.warning} strokeWidth={2} />
                </View>
                <Text style={styles.captureTitle}>Pilih Galeri</Text>
                <Text style={styles.captureDesc}>Unggah dari foto tersimpan</Text>
              </Pressable>
            </View>

            {/* Petunjuk Riset */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsHeading}>💡 Tips Akurasi Maksimal</Text>
              <Text style={styles.tipsItem}>• Pastikan pencahayaan cukup dan struk tidak terlipat.</Text>
              <Text style={styles.tipsItem}>• Posisikan kamera sejajar tegak lurus dengan struk.</Text>
              <Text style={styles.tipsItem}>• Gunakan fitur crop untuk memperjelas area total & rincian.</Text>
            </View>
          </View>
        )}

        {/* State 2: Sedang Memproses */}
        {isProcessing && (
          <View style={styles.processingWrap}>
            <ActivityIndicator size="large" color={Colors.light.primary} />
            <Text style={styles.processingTitle}>Mengekstraksi Teks Struk...</Text>
            <Text style={styles.processingDesc}>
              Menjalankan OCR on-device, rekonstruksi koordinat baris, dan koreksi Levenshtein.
            </Text>
          </View>
        )}

        {/* State 3: Hasil Ekstraksi & Form Konfirmasi */}
        {parsed && !isProcessing && (
          <View style={styles.resultWrap}>
            {/* Image Preview & Confidence Badge */}
            <View style={styles.previewCard}>
              {imageUri && (
                <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
              )}
              <View style={styles.previewOverlay}>
                <View
                  style={[
                    styles.confidencePill,
                    parsed.confidence === 'high'
                      ? styles.confHigh
                      : parsed.confidence === 'medium'
                      ? styles.confMedium
                      : styles.confLow,
                  ]}
                >
                  <Text style={styles.confPillText}>
                    Keyakinan: {parsed.confidence.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.msBadgeText}>Diproses dalam {durationMs} ms</Text>
              </View>
            </View>

            {/* Verification Warning if Ambiguous */}
            {parsed.needsConfirmation && (
              <View style={styles.warningAlertBox}>
                <Icon name="eye" size={16} color={Colors.light.warning} />
                <Text style={styles.warningAlertText}>
                  Perlu diperiksa: Koreksi otomatis menemukan ketidakpastian. Mohon pastikan nominal dan nama toko sudah sesuai.
                </Text>
              </View>
            )}

            {/* Confirmation Form */}
            <View style={styles.formCard}>
              {/* Merchant Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama Toko / Merchant</Text>
                <TextInput
                  value={merchant}
                  onChangeText={setMerchant}
                  placeholder="Contoh: Indomaret, Alfamart"
                  style={styles.textInput}
                />
              </View>

              {/* Total Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Total Belanja (Rp)</Text>
                <TextInput
                  value={total}
                  onChangeText={setTotal}
                  keyboardType="numeric"
                  placeholder="0"
                  style={[styles.textInput, styles.totalInput]}
                />
                {total ? (
                  <Text style={styles.formattedHint}>{formatRupiah(Number(total))}</Text>
                ) : null}
              </View>

              {/* Date Field */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tanggal Struk (YYYY-MM-DD)</Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.textInput}
                />
              </View>

              {/* Wallet Picker */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bayar Menggunakan Dompet</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRow}>
                  {wallets.map((w) => {
                    const sel = selectedWalletId === w.id;
                    return (
                      <Pressable
                        key={w.id}
                        onPress={() => setSelectedWalletId(w.id)}
                        style={[styles.optionPill, sel && styles.optionPillActive]}
                      >
                        <Icon name={w.icon || 'wallet'} size={14} color={sel ? '#FFFFFF' : w.color} />
                        <Text style={[styles.optionPillText, sel && styles.optionPillTextActive]}>
                          {w.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Category Picker */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Kategori</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorRow}>
                  {categories.map((c) => {
                    const sel = selectedCategoryId === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setSelectedCategoryId(c.id)}
                        style={[styles.optionPill, sel && styles.optionPillActive]}
                      >
                        <Icon name={c.icon || 'other'} size={14} color={sel ? '#FFFFFF' : c.color} />
                        <Text style={[styles.optionPillText, sel && styles.optionPillTextActive]}>
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Note */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Catatan Tambahan</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Contoh: Belanja bulanan, snack kantor"
                  style={styles.textInput}
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.formActions}>
                <Button
                  title="Simpan Transaksi Struk"
                  onPress={handleSaveTransaction}
                  loading={isSaving}
                  size="lg"
                />
                <Button
                  title="Scan Ulang"
                  variant="outline"
                  onPress={() => {
                    setImageUri(null);
                    setParsed(null);
                  }}
                  size="md"
                  style={{ marginTop: 10 }}
                />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.light.primaryDark,
  },
  headerContainer: {
    backgroundColor: Colors.light.primaryDark,
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 22,
    position: 'relative',
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  navCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: Typography.header.fontSize,
    fontWeight: Typography.header.fontWeight,
    color: '#FFFFFF',
  },
  screenSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  contentBody: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    marginTop: -12,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  introWrap: {
    gap: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  captureCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 20,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  captureCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  captureIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  captureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  captureDesc: {
    fontSize: 11,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  tipsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
    gap: 6,
  },
  tipsHeading: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 4,
  },
  tipsItem: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  processingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  processingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.light.text,
  },
  processingDesc: {
    fontSize: 13,
    color: Colors.light.textMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },
  resultWrap: {
    gap: 16,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    height: 180,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  confHigh: {
    backgroundColor: Colors.light.success,
  },
  confMedium: {
    backgroundColor: Colors.light.warning,
  },
  confLow: {
    backgroundColor: Colors.light.danger,
  },
  confPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  msBadgeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
  },
  warningAlertBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: Radius.md,
    alignItems: 'flex-start',
  },
  warningAlertText: {
    flex: 1,
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    padding: 18,
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.light.text,
  },
  totalInput: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.light.danger,
  },
  formattedHint: {
    fontSize: 13,
    color: Colors.light.success,
    fontWeight: '600',
  },
  selectorRow: {
    flexDirection: 'row',
  },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    marginRight: 8,
  },
  optionPillActive: {
    backgroundColor: Colors.light.primary,
  },
  optionPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.light.textSecondary,
  },
  optionPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  formActions: {
    marginTop: 8,
  },
});
