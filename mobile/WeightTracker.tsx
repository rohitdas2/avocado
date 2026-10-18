import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { dateKey } from './api';
import { dayWindow, lastDays, linePoints } from './workoutLogic';
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
  const [width, setWidth] = useState(0);
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
  const days = lastDays(30);
  const byDate = new Map((entries || []).map(entry => [entry.date, entry]));
  // Chart geometry. The chart fits the card (no horizontal scroll, which used to open on the
  // oldest, usually empty, days). x is the day's position in the 30-day window, so gaps between
  // logs keep their real width; logged days are joined in order so sparse logging still draws a
  // line. y is scaled to the logged range (labeled below) because day-to-day changes are small
  // next to body weight and a zero baseline made the line look flat.
  const logged = days.map((day, index) => ({ day, index, entry: byDate.get(day) })).filter(item => item.entry);
  const values = logged.map(item => displayedWeight(item.entry!, unit));
  const chartHeight = 150, inset = 12;
  // The axis starts at the first log in the last 30 days (at least a week shown), so a short
  // history spreads across the card instead of crowding the right edge.
  const window = dayWindow(logged.map(item => item.index), days.length);
  const xFor = (index: number) => inset + window.position(index) * (width - inset * 2);
  const line = linePoints(values, logged.map(item => window.position(item.index)), width, chartHeight, unit === 'kg' ? 0.5 : 1, inset);
  const { min, max } = line;
  const points = line.points.map((point, position) => ({ ...point, day: logged[position].day }));
  const focus = points.find(point => point.day === key) || points[points.length - 1];
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
      <Text style={common.secondary}>Up to 30 days · {unit}</Text>
      {!entries && !error && <Text style={common.secondary}>Loading…</Text>}
      {entries?.length === 0 && <Text style={common.secondary}>No weight logged.</Text>}
      {!!entries?.length && !points.length && <Text style={common.secondary}>No weight logged in the last 30 days.</Text>}
      {!!points.length && <>
        <View style={{ height: chartHeight }} onLayout={event => setWidth(event.nativeEvent.layout.width)} accessibilityLabel={`Weight over the last 30 days in ${unit}, from ${points[0].value.toFixed(1)} to ${points[points.length - 1].value.toFixed(1)}`}>
          {width > 0 && <>
            <View pointerEvents="none" style={[s.gridLine, { top: 10 }]} />
            <View pointerEvents="none" style={[s.gridLine, { top: chartHeight - 10 }]} />
            {/* Today's position, so recent entries are easy to find. */}
            <View pointerEvents="none" style={[s.today, { left: xFor(days.length - 1) }]} />
            {points.map((point, index) => {
              const previous = points[index - 1];
              if (!previous) return null;
              const dx = point.x - previous.x, dy = point.y - previous.y, length = Math.hypot(dx, dy);
              return <View key={`line-${point.day}`} pointerEvents="none" style={[s.segment, { left: (previous.x + point.x - length) / 2, top: (previous.y + point.y) / 2 - 1, width: length, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }]} />;
            })}
            {/* 36 pt hit targets around 8 pt markers; tapping a point selects that day for editing. */}
            {points.map(point => <Pressable key={point.day} accessibilityRole="button" accessibilityLabel={`${point.day}: ${point.value.toFixed(1)} ${unit}. Edit entry.`} accessibilityState={{ selected: point.day === focus?.day }} disabled={busy} style={[s.hit, { left: point.x - 18, top: point.y - 18 }]} onPress={() => { setDate(localDate(point.day)); setWeight(point.value.toFixed(1)); setStatus(''); }}>
              <View style={[s.point, point.day === focus?.day && s.pointFocused]} />
            </Pressable>)}
          </>}
        </View>
        <View style={common.listHeader}><Text style={common.label}>{days[window.start].slice(5).replace('-', '/')}</Text><Text style={common.label}>{min.toFixed(1)}–{max.toFixed(1)} {unit}</Text><Text style={common.label}>Today</Text></View>
        {focus && <Text style={common.secondary}>{focus.day}: {focus.value.toFixed(1)} {unit}{points.length > 1 ? ` · ${points[points.length - 1].value - points[0].value >= 0 ? '+' : ''}${(points[points.length - 1].value - points[0].value).toFixed(1)} ${unit} since ${points[0].day.slice(5).replace('-', '/')}` : ''}</Text>}
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
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  today: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  segment: { position: 'absolute', height: 2, backgroundColor: colors.accent },
  hit: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  point: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  pointFocused: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.surface },
});
