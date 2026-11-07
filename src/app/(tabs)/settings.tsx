// src/app/(tabs)/settings.tsx
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { BatikPattern } from '../../components/decorative/BatikPattern';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Colors, Radius, Typography } from '../../constants/theme';
import { Haptics } from '../../lib/haptics';
import { useTopInset } from '../../hooks/useTopInset';

export default function SettingsScreen() {
  const topInset = useTopInset(12);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const handleDarkToggle = (val: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    setIsDarkMode(val);
  };

  const handleExportCsv = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    Alert.alert('Export CSV', 'Fitur ekspor CSV transaksi siap dieksekusi.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={Platform.OS === 'android'} />

      <View style={styles.headerContainer}>
        <LinearGradient
          colors={[Colors.light.gradientStart, Colors.light.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroGradient, { paddingTop: topInset }]}
        >
          <BatikPattern opacity={0.07} color="#FFFFFF" />
          <Text style={styles.screenTitle}>Pengaturan</Text>
          <Text style={styles.screenSubtitle}>Kustomisasi aplikasi dan evaluasi riset</Text>
        </LinearGradient>
      </View>

      <ScrollView style={styles.contentBody} contentContainerStyle={styles.scrollContent}>
        {/* Section 1: Umum */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeading}>Umum</Text>
          <View style={styles.cardMenu}>
            <View style={styles.menuRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#F3F4F6' }]}>
                <Icon name="settings" size={18} color={Colors.light.text} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Tema Gelap</Text>
                <Text style={styles.menuSubtitle}>{isDarkMode ? 'Aktif' : 'Nonaktif'}</Text>
              </View>
              <Switch
                value={isDarkMode}
                onValueChange={handleDarkToggle}
                trackColor={{ false: '#E5E7EB', true: Colors.light.primary }}
              />
            </View>

            <View style={styles.divider} />

            <Pressable style={styles.menuRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#EBF3FF' }]}>
                <Icon name="cash" size={18} color={Colors.light.primary} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Mata Uang</Text>
                <Text style={styles.menuSubtitle}>Indonesian Rupiah (IDR - Rp)</Text>
              </View>
              <Icon name="chevRight" size={16} color={Colors.light.textMuted} />
            </Pressable>

            <View style={styles.divider} />

            <Pressable style={styles.menuRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#FEF3C7' }]}>
                <Icon name="wallet" size={18} color={Colors.light.warning} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Buku Keuangan</Text>
                <Text style={styles.menuSubtitle}>1 Buku aktif (Buku Utama)</Text>
              </View>
              <Icon name="chevRight" size={16} color={Colors.light.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Section 2: OCR & Riset */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeading}>Fitur Inti: Riset OCR Struk</Text>
          <View style={styles.cardMenu}>
            <Pressable
              onPress={() => router.push('/scan' as any)}
              style={styles.menuRow}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#E6F9F3' }]}>
                <Icon name="scan" size={18} color={Colors.light.success} strokeWidth={2} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Scan Struk Belanja</Text>
                <Text style={styles.menuSubtitle}>Ekstraksi OCR on-device + Levenshtein Distance</Text>
              </View>
              <Icon name="chevRight" size={16} color={Colors.light.textMuted} />
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              onPress={() => router.push('/scan/test-ocr' as any)}
              style={styles.menuRow}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#FFEAEA' }]}>
                <Icon name="camera" size={18} color={Colors.light.danger} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Uji Parser OCR Mentah</Text>
                <Text style={styles.menuSubtitle}>Debug inspeksi teks struk & waktu komputasi</Text>
              </View>
              <Icon name="chevRight" size={16} color={Colors.light.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Section 3: Data & Cadangan */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeading}>Data</Text>
          <View style={styles.cardMenu}>
            <Pressable onPress={handleExportCsv} style={styles.menuRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#EBF3FF' }]}>
                <Icon name="chart" size={18} color={Colors.light.primary} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Ekspor Data (CSV)</Text>
                <Text style={styles.menuSubtitle}>Unduh riwayat transaksi dan log evaluasi OCR</Text>
              </View>
              <Icon name="chevRight" size={16} color={Colors.light.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Section 4: Tentang */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionHeading}>Tentang Aplikasi</Text>
          <View style={styles.cardMenu}>
            <View style={styles.menuRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#F3F4F6' }]}>
                <Icon name="phone" size={18} color={Colors.light.text} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Kaskuy</Text>
                <Text style={styles.menuSubtitle}>v1.0.0 · Offline-first Android Architecture</Text>
              </View>
            </View>
          </View>
        </View>
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
  screenTitle: {
    fontSize: Typography.header.fontSize,
    fontWeight: Typography.header.fontWeight,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
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
    paddingTop: 20,
    paddingBottom: 40,
    gap: 18,
  },
  sectionWrap: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.light.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  cardMenu: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextWrap: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 62,
  },
});

