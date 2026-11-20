// src/app/scan/index.tsx
import * as ImagePicker from 'expo-image-picker';
import * as OcrModule from 'expo-mlkit-ocr';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReceiptCamera } from '../../components/scan/ReceiptCamera';
import { Button } from '../../components/ui/Button';
import { DatePickerField } from '../../components/ui/DatePickerField';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, Spacing, Typography, type ThemeColors } from '../../constants/theme';
import { getDefaultBook } from '../../db/repositories/bookRepo';
import { getCategories } from '../../db/repositories/categoryRepo';
import { learnMerchantCorrection } from '../../db/repositories/merchantDictRepo';
import { recordCorrection } from '../../db/repositories/ocrCorrectionRepo';
import { createScanResult, markScanResultCorrected } from '../../db/repositories/scanResultRepo';
import { createTransaction } from '../../db/repositories/transactionRepo';
import { getWallets } from '../../db/repositories/walletRepo';
import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { useTopInset } from '../../hooks/useTopInset';
import { formatRupiah, parseRupiahInput } from '../../lib/currency';
import { getTodayDateString, isValidDateString } from '../../lib/date';
import { Haptics } from '../../lib/haptics';
import { type ParsedReceipt, parseReceipt } from '../../lib/parseReceipt';
import { readReceiptOcr } from '../../lib/receiptOcr';
import type { Category, Wallet } from '../../types';

const ocr: any = (OcrModule as any).recognizeText
  ? OcrModule
  : (OcrModule as any).default;

type RequiredField = 'total' | 'date' | 'wallet' | 'category';

export default function ScanScreen() {
  const colors = useTheme();
  const styles = useThemedStyles(createStyles);
  const topInset = useTopInset(12);
  const bottomInset = useSafeAreaInsets().bottom;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResultId, setScanResultId] = useState<number | null>(null);
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const pickerBusy = useRef(false);
  const screenFocused = useRef(false);
  const saveBusy = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<RequiredField, number>>>({});

  // Form states for confirmation
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [date, setDate] = useState(getTodayDateString);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [didTrySave, setDidTrySave] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [optionsStatus, setOptionsStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const numTotal = parseRupiahInput(total);
  const validTotal = numTotal !== null && numTotal > 0;
  const validDate = isValidDateString(date);
  const wallet = wallets.find(({ id }) => id === selectedWalletId);
  const category = categories.find(({ id }) => id === selectedCategoryId);

  const initOptions = useCallback(async () => {
    setOptionsStatus('loading');
    try {
      const book = await getDefaultBook();
      if (!book) throw new Error('Buku keuangan tidak ditemukan.');
      const [wList, cList] = await Promise.all([getWallets(book.id), getCategories('expense')]);
      setWallets(wList);
      setSelectedWalletId(wList[0]?.id ?? null);
      setCategories(cList);
      const defaultCat = cList.find((c) => c.name.toLowerCase() === 'belanja') ?? cList[0];
      setSelectedCategoryId(defaultCat?.id ?? null);
      setOptionsStatus('ready');
    } catch (err) {
      console.error('Failed to init options:', err);
      setOptionsStatus('error');
    }
  }, []);

  const processImage = useCallback(async (uri: string) => {
    setParsed(null);
    setScanResultId(null);
    setShowPreview(false);
    setDidTrySave(false);
    setSaveError(null);
    setDate(getTodayDateString());
    setImageUri(uri);
    setIsProcessing(true);
    await initOptions();

    const start = Date.now();
    try {
      const result = await ocr.recognizeText(uri);
      const ms = Date.now() - start;

      const { rawText, reconstructedLines } = readReceiptOcr(result);
      const parsedData = parseReceipt(rawText, { reconstructedLines });
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
      setImageUri(null);
      setParsed(null);
      setScanResultId(null);
      Alert.alert('Gagal Memproses OCR', err?.message || 'Pastikan foto struk jelas.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  }, [initOptions]);

  const pickImage = useCallback(async (source: 'camera' | 'gallery') => {
    if (pickerBusy.current || !screenFocused.current) return;
    pickerBusy.current = true;
    setIsOpeningPicker(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (source === 'camera' && Platform.OS !== 'web') {
        let permission = await ImagePicker.getCameraPermissionsAsync();
        if (!permission.granted && permission.canAskAgain) {
          permission = await ImagePicker.requestCameraPermissionsAsync();
        }
        if (!screenFocused.current) return;
        if (!permission.granted) {
          Alert.alert(
            'Izin Kamera Diperlukan',
            'Izinkan akses kamera untuk memotret struk, atau pilih foto dari galeri.',
            [
              { text: 'Batal', style: 'cancel' },
              {
                text: 'Buka Pengaturan',
                onPress: () => {
                  void Linking.openSettings().catch(() => {
                    Alert.alert('Gagal Membuka Pengaturan', 'Buka pengaturan izin kamera secara manual.');
                  });
                },
              },
            ]
          );
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 1,
      };

      const res =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (screenFocused.current && !res.canceled && res.assets[0]?.uri) {
        await processImage(res.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Gagal membuka kamera/galeri');
    } finally {
      pickerBusy.current = false;
      setIsOpeningPicker(false);
    }
  }, [processImage]);

  useFocusEffect(
    useCallback(() => {
      screenFocused.current = true;
      setIsFocused(true);

      return () => {
        screenFocused.current = false;
        setIsFocused(false);
      };
    }, [])
  );

  const closeScan = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  const handleCapture = useCallback(async (uri: string) => {
    if (screenFocused.current && !pickerBusy.current) await processImage(uri);
  }, [processImage]);

  const openGallery = useCallback(() => pickImage('gallery'), [pickImage]);
  const openSystemCamera = useCallback(() => pickImage('camera'), [pickImage]);

  const restartScan = () => {
    if (saveBusy.current) return;
    Keyboard.dismiss();
    setImageUri(null);
    setParsed(null);
    setScanResultId(null);
  };

  const handleSaveTransaction = async () => {
    if (!screenFocused.current || saveBusy.current || optionsStatus !== 'ready') return;
    setDidTrySave(true);
    setSaveError(null);
    Keyboard.dismiss();
    if (!validTotal || !validDate || !wallet || !category) {
      const firstInvalid = !validTotal ? 'total' : !validDate ? 'date' : !wallet ? 'wallet' : 'category';
      scrollRef.current?.scrollTo({ y: fieldOffsets.current[firstInvalid] ?? 0, animated: true });
      return;
    }

    saveBusy.current = true;
    setIsSaving(true);
    let saved = false;
    try {
      const book = await getDefaultBook();
      if (!book) throw new Error('Buku keuangan tidak ditemukan.');

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
        wallet_id: wallet.id,
        category_id: category.id,
        type: 'expense',
        amount: numTotal,
        note: note.trim() || `Struk ${merchant || 'Belanja'}`,
        date,
        scan_result_id: scanResultId,
      });

      saved = true;
      if (!screenFocused.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Transaksi Disimpan', `Pengeluaran dicatat ke ${wallet.name}.`, [
        { text: 'OK', onPress: closeScan },
      ]);
    } catch (error: unknown) {
      if (screenFocused.current) {
        setSaveError(error instanceof Error ? error.message : 'Transaksi gagal disimpan. Coba lagi.');
      }
    } finally {
      if (!saved) {
        saveBusy.current = false;
        setIsSaving(false);
      }
    }
  };

  if (!imageUri && !isProcessing) {
    return (
      <ReceiptCamera
        active={isFocused && !isOpeningPicker}
        onCapture={handleCapture}
        onGallery={openGallery}
        onClose={closeScan}
        onSystemCamera={openSystemCamera}
      />
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topInset }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup scan struk"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={closeScan}
          style={styles.navCloseBtn}
        >
          <Icon name="close" size={20} color="#FFFFFF" />
        </Pressable>
        <Text accessibilityRole="header" style={styles.screenTitle}>
          {isProcessing ? 'Scan Struk' : 'Konfirmasi Struk'}
        </Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      {isProcessing && (
        <View style={styles.processingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text accessibilityLiveRegion="polite" style={styles.processingTitle}>Membaca struk…</Text>
        </View>
      )}

      {parsed && !isProcessing && (
        <>
          <ScrollView
            ref={scrollRef}
            style={styles.contentBody}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.formCard}>
              <View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showPreview }}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowPreview(!showPreview);
                  }}
                  style={styles.previewToggle}
                >
                  <Icon name="eye" size={18} color={colors.primary} />
                  <Text style={styles.previewLabel}>
                    {showPreview ? 'Sembunyikan foto struk' : 'Lihat foto struk'}
                  </Text>
                  <Icon name={showPreview ? 'arrowUp' : 'chevDown'} size={16} color={colors.primary} />
                </Pressable>
                {showPreview && imageUri && (
                  <Image
                    accessibilityLabel="Foto struk yang dipindai"
                    source={{ uri: imageUri }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                )}
              </View>

              {parsed.needsConfirmation && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>Periksa total dan nama toko pada foto struk sebelum menyimpan.</Text>
                </View>
              )}

              <View
                style={styles.inputGroup}
                onLayout={({ nativeEvent }) => { fieldOffsets.current.total = nativeEvent.layout.y; }}
              >
                <Text style={styles.inputLabel}>Total belanja</Text>
                <View style={[styles.nominalField, didTrySave && !validTotal && styles.invalidField]}>
                  <Text style={styles.currencyPrefix}>Rp</Text>
                  <TextInput
                    accessibilityLabel="Total belanja dalam Rupiah"
                    value={total}
                    onChangeText={setTotal}
                    editable={!isSaving}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.totalInput}
                  />
                </View>
                {didTrySave && !validTotal ? (
                  <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                    Masukkan nominal Rupiah bulat lebih dari Rp0.
                  </Text>
                ) : validTotal ? (
                  <Text style={styles.fieldHint}>{formatRupiah(numTotal)}</Text>
                ) : (
                  <Text style={styles.fieldHint}>Isi total sesuai foto struk.</Text>
                )}
              </View>

              <View
                style={styles.inputGroup}
                onLayout={({ nativeEvent }) => { fieldOffsets.current.date = nativeEvent.layout.y; }}
              >
                <Text style={styles.inputLabel}>Tanggal transaksi</Text>
                <DatePickerField label="Tanggal transaksi" value={date} onChange={setDate} disabled={isSaving} />
                {didTrySave && !validDate ? (
                  <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                    Pilih tanggal transaksi yang benar.
                  </Text>
                ) : !parsed.date ? (
                  <Text style={styles.fieldHint}>Tanggal belum terbaca. Periksa tanggal yang dipilih.</Text>
                ) : null}
              </View>

              {optionsStatus !== 'ready' ? (
                <View style={styles.inputGroup}>
                  {optionsStatus === 'loading' ? (
                    <Text accessibilityLiveRegion="polite" style={styles.fieldHint}>Memuat dompet dan kategori…</Text>
                  ) : (
                    <>
                      <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
                        Dompet dan kategori gagal dimuat.
                      </Text>
                      <Button title="Muat Ulang Pilihan" variant="outline" size="sm" onPress={initOptions} />
                    </>
                  )}
                </View>
              ) : (
                <>
                  <View
                    style={styles.inputGroup}
                    onLayout={({ nativeEvent }) => { fieldOffsets.current.wallet = nativeEvent.layout.y; }}
                  >
                    <Text style={styles.inputLabel}>Dompet</Text>
                    {wallets.length > 0 ? (
                      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
                        {wallets.map((option) => {
                          const selected = selectedWalletId === option.id;
                          return (
                            <Pressable
                              key={option.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected, disabled: isSaving }}
                              disabled={isSaving}
                              onPress={() => setSelectedWalletId(option.id)}
                              style={[styles.optionPill, selected && styles.optionPillActive]}
                            >
                              <Icon name={option.icon || 'wallet'} size={16} color={selected ? colors.primary : option.color} />
                              <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <Text style={didTrySave ? styles.fieldError : styles.fieldHint}>
                        Belum ada dompet aktif. Tambahkan atau aktifkan dompet dari tab Dompet.
                      </Text>
                    )}
                    {didTrySave && !wallet && wallets.length > 0 && (
                      <Text accessibilityLiveRegion="polite" style={styles.fieldError}>Pilih dompet yang digunakan.</Text>
                    )}
                  </View>

                  <View
                    style={styles.inputGroup}
                    onLayout={({ nativeEvent }) => { fieldOffsets.current.category = nativeEvent.layout.y; }}
                  >
                    <Text style={styles.inputLabel}>Kategori</Text>
                    {categories.length > 0 ? (
                      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorRow}>
                        {categories.map((option) => {
                          const selected = selectedCategoryId === option.id;
                          return (
                            <Pressable
                              key={option.id}
                              accessibilityRole="button"
                              accessibilityState={{ selected, disabled: isSaving }}
                              disabled={isSaving}
                              onPress={() => setSelectedCategoryId(option.id)}
                              style={[styles.optionPill, selected && styles.optionPillActive]}
                            >
                              <Icon name={option.icon || 'other'} size={16} color={selected ? colors.primary : option.color} />
                              <Text style={[styles.optionText, selected && styles.optionTextActive]}>{option.name}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <Text style={didTrySave ? styles.fieldError : styles.fieldHint}>
                        Belum ada kategori pengeluaran. Tambahkan kategori dari Pengaturan.
                      </Text>
                    )}
                    {didTrySave && !category && categories.length > 0 && (
                      <Text accessibilityLiveRegion="polite" style={styles.fieldError}>Pilih kategori pengeluaran.</Text>
                    )}
                  </View>
                </>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nama toko</Text>
                <TextInput
                  accessibilityLabel="Nama toko"
                  value={merchant}
                  onChangeText={setMerchant}
                  editable={!isSaving}
                  placeholder="Nama toko pada struk"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.textInput}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Catatan (opsional)</Text>
                <TextInput
                  accessibilityLabel="Catatan opsional"
                  value={note}
                  onChangeText={setNote}
                  editable={!isSaving}
                  placeholder="Tambahkan catatan"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.textInput}
                />
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, Spacing.md) }]}>
            {saveError && <Text accessibilityLiveRegion="polite" style={styles.fieldError}>{saveError}</Text>}
            <View style={styles.actions}>
              <Button title="Scan Ulang" variant="outline" onPress={restartScan} disabled={isSaving} />
              <Button
                title="Simpan Transaksi"
                onPress={handleSaveTransaction}
                disabled={optionsStatus !== 'ready'}
                loading={isSaving}
                style={styles.saveButton}
              />
            </View>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  navCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  screenTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typography.header.fontSize,
    fontWeight: Typography.header.fontWeight,
    color: '#FFFFFF',
  },
  contentBody: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  processingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    gap: Spacing.md,
  },
  processingTitle: {
    fontSize: Typography.subtitle.fontSize,
    fontWeight: '600',
    color: colors.text,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: Spacing.sm,
  },
  previewLabel: {
    flex: 1,
    color: colors.primary,
    fontWeight: '600',
  },
  previewImage: {
    width: '100%',
    height: 280,
    backgroundColor: colors.background,
    borderRadius: Radius.md,
  },
  warningBox: {
    backgroundColor: colors.warningLight,
    borderRadius: Radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    padding: Spacing.md,
  },
  warningText: {
    color: colors.text,
    fontSize: Typography.body.fontSize,
    lineHeight: 20,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  inputLabel: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: colors.text,
  },
  textInput: {
    minHeight: 48,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    color: colors.text,
  },
  nominalField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 54,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  totalInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  invalidField: {
    borderColor: colors.danger,
  },
  fieldHint: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  fieldError: {
    color: colors.text,
    backgroundColor: colors.dangerLight,
    borderRadius: Radius.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    fontSize: 13,
    padding: Spacing.sm,
  },
  selectorRow: {
    gap: Spacing.sm,
  },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  optionPillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  optionTextActive: {
    fontWeight: '700',
  },
  footer: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  saveButton: {
    flex: 1,
  },
});
