import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { dateKey } from './api';
import { type Colors, useTheme } from './theme';

export default function DateNavigation({ date, disabled, onChange }: { date: Date; disabled: boolean; onChange: (date: Date) => void }) {
  const { colors, common, dark } = useTheme();
  const s = styles(colors);
  const [picker, setPicker] = useState(false);
  function move(offset: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + offset);
    onChange(next);
  }
  return <View>
    <View style={s.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous day" disabled={disabled} onPress={() => move(-1)} style={s.arrow}><Text style={s.arrowText}>‹</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose date" disabled={disabled} onPress={() => setPicker(!picker)} style={s.date}><Text style={s.dateText}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next day" disabled={disabled} onPress={() => move(1)} style={s.arrow}><Text style={s.arrowText}>›</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={disabled || dateKey(date) === dateKey(new Date())} onPress={() => onChange(new Date())} style={[s.today, dateKey(date) === dateKey(new Date()) && common.disabled]}><Text style={common.link}>Today</Text></Pressable>
    </View>
    {picker && <DateTimePicker value={date} mode="date" themeVariant={dark ? 'dark' : 'light'} display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={(_event, value) => { setPicker(false); if (value && !disabled) onChange(value); }} />}
  </View>;
}

const styles = (colors: Colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  date: { minHeight: 44, flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10 },
  dateText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  arrow: { minHeight: 44, width: 36, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: colors.accent, fontSize: 28, lineHeight: 32 },
  today: { minHeight: 44, paddingLeft: 10, justifyContent: 'center' },
});
