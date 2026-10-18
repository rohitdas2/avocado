import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { dateKey } from './api';
import useScopedApi from './useScopedApi';
import DateNavigation from './DateNavigation';
import { type Colors, useTheme } from './theme';
import useForegroundRefresh from './useForegroundRefresh';

type Unit = 'lb' | 'kg';
type WeightEntry = { date: string; weight: number; unit: Unit; weightKg: number };
const poundsToKg = 0.45359237;
const displayedWeight = (entry: WeightEntry, unit: Unit) => unit === 'kg' ? entry.weightKg : entry.weightKg / poundsToKg;
const localDate = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); };

export default function WeightTracker() {
  const api = useScopedApi();
  const { colors, common, dark } = useTheme();
  const s = styles(colors);
  const [entries, setEntries] = useState<WeightEntry[] | null>(null);
  const [date, setDate] = useState(new Date());
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<Unit>('lb');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  const version = useRef(0);
  const mounted = useRef(true);
  const key = dateKey(date);
  const refresh = useCallback(() => {
    if (lock.current) return;
    const request = ++version.current;
    api<{ entries: WeightEntry[] }>('/weights').then(result => { if (mounted.current && request === version.current) setEntries(result.entries); }).catch(e => { if (mounted.current && request === version.current) setError(e.message); });
  }, [api]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; version.current += 1; }; }, [refresh]);
  useForegroundRefresh(refresh);
  const selected = entries?.find(entry => entry.date === key);
  function changeUnit(next: Unit) {
    if (next === unit) return;
    const value = Number(weight);
    if (weight.trim() && Number.isFinite(value) && value > 0) setWeight((next === 'kg' ? value * poundsToKg : value / poundsToKg).toFixed(1));
    setUnit(next);
  }
  async function mutate(remove = false) {
    if (lock.current) return;
    const value = Number(weight);
    if (!remove && (!weight.trim() || !Number.isFinite(value) || value <= 0 || value > (unit === 'kg' ? 1500 : 3307))) { setError(`Enter a weight above 0 and up to ${unit === 'kg' ? '1,500 kg' : '3,307 lb'}.`); return; }
    lock.current = true; version.current += 1; setBusy(true); setError(''); setStatus('');
    try {
      if (remove) {
        await api(`/weights/${key}`, { method: 'DELETE' });
        if (mounted.current) { setEntries(old => old?.filter(entry => entry.date !== key) || []); setWeight(''); setStatus('Weight removed.'); }
      } else {
        const entry = await api<WeightEntry>('/weights', { method: 'POST', body: JSON.stringify({ date: key, weight: value, unit }) });
        if (mounted.current) { setEntries(old => [...(old || []).filter(item => item.date !== key), entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-30)); setWeight(''); setStatus('Weight saved.'); }
      }
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const days = Array.from({ length: 30 }, (_, index) => { const day = new Date(); day.setDate(day.getDate() - 29 + index); return dateKey(day); });
  const byDate = new Map((entries || []).map(entry => [entry.date, entry]));
  const visibleEntries = (entries || []).filter(entry => days.includes(entry.date));
  const maximum = Math.max(10, Math.ceil(Math.max(...visibleEntries.map(entry => displayedWeight(entry, unit)), 1) / 10) * 10);
  const points = days.map((day, index) => {
    const entry = byDate.get(day);
    const value = entry ? displayedWeight(entry, unit) : null;
    return { day, value, x: index * 48 + 24, y: value === null ? null : 158 - value / maximum * 140 };
  });
  return <View style={common.card}>
    <Text style={common.heading}>Weight</Text>
    <DateNavigation date={date} disabled={busy} onChange={next => { setDate(next); setWeight(''); setStatus(''); }} />
    <View style={common.row}>
      <View style={[common.field, { flex: 1 }]}><Text style={common.label}>Weight ({unit})</Text><TextInput accessibilityLabel={`Body weight in ${unit === 'lb' ? 'pounds' : 'kilograms'}`} style={common.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" keyboardAppearance={dark ? 'dark' : 'light'} maxLength={12} editable={!busy} placeholder={selected ? displayedWeight(selected, unit).toFixed(1) : 'Weight'} placeholderTextColor={colors.placeholder} /></View>
      <View style={s.units}>{(['lb', 'kg'] as Unit[]).map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: unit === value }} accessibilityLabel={value === 'lb' ? 'Pounds' : 'Kilograms'} key={value} disabled={busy} style={[s.unit, unit === value && s.selectedUnit]} onPress={() => changeUnit(value)}><Text style={[common.secondary, unit === value && { color: colors.accent, fontWeight: '600' }]}>{value}</Text></Pressable>)}</View>
    </View>
    <Pressable accessibilityRole="button" disabled={busy || !entries} style={[common.button, (busy || !entries) && common.disabled]} onPress={() => void mutate()}><Text style={common.buttonText}>{busy ? 'Saving…' : selected ? 'Update weight' : 'Log weight'}</Text></Pressable>
    {selected && <Pressable accessibilityRole="button" accessibilityLabel={`Delete weight for ${key}`} disabled={busy} style={common.textButton} onPress={() => void mutate(true)}><Text style={common.deleteText}>Delete this entry</Text></Pressable>}
    <View style={{ gap: 10, paddingTop: 8 }}>
      <Text style={common.heading}>Daily weight</Text>
      <Text style={common.secondary}>Last 30 days · {unit}</Text>
      {!entries && !error && <Text style={common.secondary}>Loading…</Text>}
      {entries?.length === 0 && <Text style={common.secondary}>No weight logged.</Text>}
      {!!entries?.length && <>
        <Text style={common.label}>0–{Math.ceil(maximum)} {unit}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={s.chart} accessibilityLabel={`Daily weight line graph in ${unit}`}>
          <View style={{ width: days.length * 48, height: 200 }}>
            {/* Join adjacent measured days only; missing days break the line. */}
            {points.map((point, index) => {
              const previous = points[index - 1];
              if (!previous || previous.y === null || point.y === null) return null;
              const dx = point.x - previous.x, dy = point.y - previous.y;
              const length = Math.hypot(dx, dy);
              return <View key={`line-${point.day}`} pointerEvents="none" style={[s.segment, { left: (previous.x + point.x - length) / 2, top: (previous.y + point.y) / 2 - 1, width: length, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }]} />;
            })}
            <View pointerEvents="none" style={s.baseline} />
            {points.map(point => <Pressable key={point.day} accessibilityRole="button" accessibilityLabel={point.value === null ? `${point.day}: No weight logged. Add entry.` : `${point.day}: ${point.value.toFixed(1)} ${unit}. Edit entry.`} accessibilityState={{ selected: point.day === key }} disabled={busy} style={[s.column, { left: point.x - 24 }]} onPress={() => { setDate(localDate(point.day)); setWeight(point.value === null ? '' : point.value.toFixed(1)); setStatus(''); }}>
              {point.y !== null && <><Text style={[s.value, { top: point.y - 18 }]}>{point.value?.toFixed(1)}</Text><View style={[s.point, { top: point.y - 4, opacity: point.day === key ? 1 : 0.75 }]} /></>}
              <Text style={s.date}>{point.day.slice(5).replace('-', '/')}</Text>
            </Pressable>)}
          </View>
        </ScrollView>
        <Text style={common.label}>Gaps are days without a log.</Text>
      </>}
    </View>
    {!!error && <View><Text accessibilityRole="alert" style={common.error}>{error}</Text>{!entries && <Pressable accessibilityRole="button" style={common.textButton} onPress={refresh}><Text style={common.link}>Retry</Text></Pressable>}</View>}
    {!!status && <Text accessibilityLiveRegion="polite" style={common.secondary}>{status}</Text>}
  </View>;
}

const styles = (colors: Colors) => StyleSheet.create({
  units: { flexDirection: 'row', backgroundColor: colors.background === '#000000' ? '#2c2c2e' : colors.background, borderRadius: 9, padding: 3, alignSelf: 'flex-end', marginBottom: 1 },
  unit: { minHeight: 40, minWidth: 42, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  selectedUnit: { backgroundColor: colors.accentSurface },
  chart: { paddingTop: 4, paddingBottom: 4 },
  column: { position: 'absolute', top: 0, width: 48, height: 200, alignItems: 'center' },
  baseline: { position: 'absolute', top: 158, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  segment: { position: 'absolute', height: 2, backgroundColor: colors.accent },
  point: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  value: { position: 'absolute', color: colors.text, fontSize: 11, fontWeight: '500' },
  date: { position: 'absolute', top: 172, color: colors.secondary, fontSize: 11 },
});
