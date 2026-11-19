import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { MONTH_NAMES, formatReadableDate, getCurrentMonthString, getMonthRange, isValidDateString, isValidMonthString } from '../../lib/date';
import { useTheme } from '../../hooks/use-theme';
import { Icon } from './Icon';

export function DatePickerField({ value, onChange, monthOnly = false, label }: {
  value: string; onChange: (value: string) => void; monthOnly?: boolean; label: string;
}) {
  const colors = useTheme();
  const [open, setOpen] = useState(false);
  const [shownMonth, setShownMonth] = useState(getCurrentMonthString());
  const [year, month] = shownMonth.split('-').map(Number);
  const openPicker = () => {
    const selectedMonth = monthOnly ? value : value.slice(0, 7);
    setShownMonth(isValidMonthString(selectedMonth) ? selectedMonth : getCurrentMonthString());
    setOpen(true);
  };
  const move = (direction: number) => {
    const date = new Date(year + (monthOnly ? direction : 0), month - 1 + (monthOnly ? 0 : direction), 1);
    if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return;
    setShownMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };
  const choose = (selected: string) => { onChange(selected); setOpen(false); };
  const display = monthOnly
    ? (isValidMonthString(value) ? `${MONTH_NAMES[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}` : 'Pilih bulan')
    : (isValidDateString(value) ? formatReadableDate(value) : 'Pilih tanggal');
  const dayCount = Number(getMonthRange(shownMonth).endDate.slice(-2));
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${display}`} onPress={openPicker} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface }}>
      <Text style={{ color: colors.text }}>{display}</Text><Icon name="chevDown" color={colors.primary} size={18} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View accessibilityViewIsModal style={{ backgroundColor: colors.surface, padding: 20, borderRadius: 20, gap: 18 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={monthOnly ? 'Tahun sebelumnya' : 'Bulan sebelumnya'} onPress={() => move(-1)} style={{ padding: 10 }}><Icon name="chevLeft" color={colors.primary} size={20} /></Pressable>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{monthOnly ? year : `${MONTH_NAMES[month - 1]} ${year}`}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={monthOnly ? 'Tahun berikutnya' : 'Bulan berikutnya'} onPress={() => move(1)} style={{ padding: 10 }}><Icon name="chevRight" color={colors.primary} size={20} /></Pressable>
          </View>
          {monthOnly ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MONTH_NAMES.map((name, index) => {
              const selected = `${year}-${String(index + 1).padStart(2, '0')}`;
              return <Pressable key={name} onPress={() => choose(selected)} accessibilityRole="button" style={{ width: '33.333%', paddingVertical: 14, alignItems: 'center', borderRadius: 10, backgroundColor: selected === value ? colors.primaryLight : 'transparent' }}><Text style={{ color: colors.text }}>{name.slice(0, 3)}</Text></Pressable>;
            })}
          </View> : <View>
            <View style={{ flexDirection: 'row' }}>{['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((name) => <Text key={name} style={{ width: '14.285%', textAlign: 'center', color: colors.textMuted, fontSize: 12, paddingBottom: 8 }}>{name}</Text>)}</View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: offset + dayCount }, (_, index) => {
                const day = index - offset + 1;
                if (day < 1) return <View key={index} style={{ width: '14.285%', height: 42 }} />;
                const selected = `${shownMonth}-${String(day).padStart(2, '0')}`;
                return <Pressable key={index} onPress={() => choose(selected)} accessibilityRole="button" accessibilityLabel={formatReadableDate(selected)} style={{ width: '14.285%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: selected === value ? colors.primary : 'transparent' }}><Text style={{ color: selected === value ? '#FFFFFF' : colors.text }}>{day}</Text></Pressable>;
              })}
            </View>
          </View>}
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: colors.primary }}>Batal</Text></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
