import { useTheme, useThemedStyles } from '../../hooks/use-theme';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { LinearGradient } from '../../components/ui/LinearGradient';
import { Radius, type ThemeColors } from '../../constants/theme';
import { useAppPreferences } from '../../contexts/AppPreferences';
import { CATEGORY_ICON_NAMES, createCategory, deleteCategory, getCategories, updateCategory } from '../../db/repositories/categoryRepo';
import { useTopInset } from '../../hooks/useTopInset';
import type { Category, CategoryType } from '../../types';

const CATEGORY_COLORS = ['#0066FF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#00AED6', '#6366F1'];

export default function ManageCategoriesScreen() {
  const colors = useTheme();
  const { colorScheme } = useAppPreferences();
  const styles = useThemedStyles(colorScheme === 'dark' ? createDarkStyles : createLightStyles);
  const topInset = useTopInset(12);
  const [categories, setCategories] = useState<Category[]>([]);
  const [type, setType] = useState<CategoryType>('expense');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('other');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const focused = useRef(false);
  const loadVersion = useRef(0);
  const phase = useRef<'idle' | 'confirming' | 'working'>('idle');

  const resetForm = () => { setEditingId(null); setName(''); setIcon('other'); setColor(CATEGORY_COLORS[0]); };
  const loadCategories = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError(null);
    try {
      const list = await getCategories();
      if (focused.current && version === loadVersion.current) setCategories(list);
    } catch {
      if (focused.current && version === loadVersion.current) setError('Kategori belum dapat dimuat. Silakan coba lagi.');
    } finally {
      if (focused.current && version === loadVersion.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setBusy(phase.current === 'working');
    void loadCategories();
    return () => { focused.current = false; loadVersion.current++; };
  }, [loadCategories]));

  const mutate = async (operation: () => Promise<unknown>) => {
    if (phase.current !== 'idle') return;
    phase.current = 'working';
    setBusy(true);
    try {
      await operation();
      if (focused.current) {
        resetForm();
        await loadCategories();
      }
    } catch (err: unknown) {
      if (focused.current) Alert.alert('Perubahan Belum Disimpan', err instanceof Error ? err.message : 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      phase.current = 'idle';
      if (focused.current) setBusy(false);
    }
  };

  const confirmDelete = (category: Category) => {
    if (phase.current !== 'idle') return;
    phase.current = 'confirming';
    const dismiss = () => { if (phase.current === 'confirming') phase.current = 'idle'; };
    Alert.alert('Hapus Kategori', `Hapus kategori “${category.name}”? Kategori yang digunakan transaksi atau budget tidak dapat dihapus.`, [
      { text: 'Batal', style: 'cancel', onPress: dismiss },
      { text: 'Hapus', style: 'destructive', onPress: () => {
        if (phase.current !== 'confirming' || !focused.current) { dismiss(); return; }
        phase.current = 'idle';
        void mutate(() => deleteCategory(category.id));
      } },
    ], { cancelable: true, onDismiss: dismiss });
  };

  const startEdit = (category: Category) => {
    if (busy) return;
    setEditingId(category.id);
    setName(category.name);
    setType(category.type);
    setIcon(category.icon);
    setColor(category.color);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <LinearGradient variant="header" style={[styles.header, { paddingTop: topInset }]}>
        <View style={styles.headerRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Kembali" onPress={() => router.back()} style={styles.backButton}>
            <Icon name="chevLeft" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.headerTitle}>Kelola Kategori</Text>
        </View>
        <Text style={styles.headerSubtitle}>Atur kategori pemasukan dan pengeluaran Anda.</Text>
      </LinearGradient>

      <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{editingId === null ? 'Tambah Kategori' : 'Ubah Kategori'}</Text>
          <View style={styles.typeRow}>
            {(['expense', 'income'] as const).map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: type === value, disabled: busy || editingId !== null }}
                disabled={busy || editingId !== null} onPress={() => setType(value)} style={[styles.typeButton, type === value && styles.selectedType]}>
                <Text style={[styles.typeText, type === value && styles.selectedTypeText]}>{value === 'expense' ? 'Pengeluaran' : 'Pemasukan'}</Text>
              </Pressable>
            ))}
          </View>
          {editingId !== null && <Text style={styles.hint}>Jenis kategori tetap agar riwayat transaksi tetap konsisten.</Text>}
          <TextInput accessibilityLabel="Nama kategori" placeholder="Contoh: Perawatan Kendaraan" placeholderTextColor={colors.textMuted}
            value={name} onChangeText={setName} editable={!busy} maxLength={40} style={styles.input} />
          <Text style={styles.fieldLabel}>Ikon</Text>
          <View style={styles.options}>
            {CATEGORY_ICON_NAMES.map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Ikon ${value}`} accessibilityState={{ selected: icon === value }}
                onPress={() => setIcon(value)} disabled={busy} style={[styles.iconButton, icon === value && styles.selectedOption]}>
                <Icon name={value} size={23} color={icon === value ? color : colors.textSecondary} />
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Warna</Text>
          <View style={styles.options}>
            {CATEGORY_COLORS.map((value) => (
              <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Warna ${value}`} accessibilityState={{ selected: color === value }}
                onPress={() => setColor(value)} disabled={busy} style={[styles.colorButton, { backgroundColor: value }]}>
                {color.toUpperCase() === value.toUpperCase() && <Icon name="check" color="#FFFFFF" size={21} />}
              </Pressable>
            ))}
          </View>
          <View style={styles.preview}>
            <View style={[styles.categoryIcon, { backgroundColor: `${color}20` }]}><Icon name={icon} size={23} color={color} /></View>
            <Text style={styles.categoryName}>{name.trim() || 'Pratinjau kategori'}</Text>
          </View>
          <Button title={editingId === null ? 'Tambah Kategori' : 'Simpan Perubahan'} loading={busy} disabled={busy || !name.trim()}
            onPress={() => { void mutate(() => editingId === null ? createCategory(name, type, icon, color) : updateCategory(editingId, { name, icon, color })); }} />
          {editingId !== null && <Button title="Batal Mengubah" variant="outline" disabled={busy} onPress={resetForm} />}
        </View>

        <Text style={styles.sectionTitle}>Kategori {type === 'expense' ? 'Pengeluaran' : 'Pemasukan'}</Text>
        <Text style={styles.hint}>Kategori berlaku untuk semua buku. Kategori bawaan dapat diubah namanya, ikonnya, dan warnanya.</Text>
        {loading ? <Text style={styles.hint}>Memuat kategori...</Text> : error ? (
          <View style={styles.card}><Text style={styles.error}>{error}</Text><Button title="Coba Lagi" variant="outline" onPress={() => { void loadCategories(); }} /></View>
        ) : categories.filter((category) => category.type === type).map((category) => (
          <View key={category.id} style={styles.card}>
            <View style={styles.categoryRow}>
              <View style={[styles.categoryIcon, { backgroundColor: `${category.color}20` }]}><Icon name={category.icon} size={23} color={category.color} /></View>
              <View style={styles.categoryText}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.hint}>{category.is_default === 1 ? 'Kategori bawaan' : 'Kategori Anda'}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button title="Ubah" variant="outline" size="sm" disabled={busy} onPress={() => startEdit(category)} />
              {category.is_default !== 1 && <Button title="Hapus" variant="danger" size="sm" disabled={busy} onPress={() => confirmDelete(category)} />}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createLightStyles = (colors: ThemeColors) => createStyles(colors, false);
const createDarkStyles = (colors: ThemeColors) => createStyles(colors, true);

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: isDark ? colors.gradientStart : colors.primaryDark },
  header: { paddingHorizontal: 20, paddingBottom: isDark ? Radius.xl + 12 : 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.15)' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', flex: 1 },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18, marginTop: 10 },
  body: { flex: 1, backgroundColor: colors.background, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, marginTop: isDark ? -Radius.xl : -12 },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: Radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.borderLight },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: { flex: 1, borderRadius: Radius.sm, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  selectedType: { borderColor: isDark ? colors.selectionBackground : colors.primary, backgroundColor: isDark ? colors.selectionBackground : colors.primaryLight },
  typeText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  selectedTypeText: { color: isDark ? colors.selectionText : colors.primary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 12, color: colors.text, fontSize: 15, backgroundColor: colors.surface },
  hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  fieldLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  selectedOption: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  colorButton: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  categoryIcon: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  categoryText: { flex: 1, gap: 3 },
  categoryName: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
