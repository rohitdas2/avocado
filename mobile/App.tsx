import LogTime from './LogTime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { dateKey } from './api';
import useScopedApi from './useScopedApi';
import IngredientSearch from './IngredientSearch';
import DateNavigation from './DateNavigation';
import { type Colors, useTheme } from './theme';
import useForegroundRefresh from './useForegroundRefresh';
import ScreenHeader from './ScreenHeader';
import CustomFoods from './CustomFoods';
import NutritionFields, { emptyMacros, parseMacros, validMacros, type MacroDraft } from './NutritionFields';

type Entry = { createdAt?: string; id: string; name: string; calories: number; date: string; protein?: number | null; carbs?: number | null; fat?: number | null };
type Day = { entries: Entry[]; total: number };
function Diary() {
  const api = useScopedApi();
  const { colors, common, dark } = useTheme();
  const s = styles(colors);
  const [date, updateDate] = useState(new Date());
  const [day, setDay] = useState<Day | null>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [macroDraft, setMacroDraft] = useState<MacroDraft>(emptyMacros);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  // Add food has two modes sharing one card: USDA search (serving size + macro preview before
  // confirming) or Quick add (name, calories, and macros typed by the user). Both post to /api/entries.
  const [mode, setMode] = useState<'search' | 'quick'>('search');
  const locked = useRef(false);
  const requestVersion = useRef(0);
  const key = dateKey(date);
  function setDate(next: Date) { if (dateKey(next) !== key) { requestVersion.current += 1; setDay(null); setError(''); setLoadError(''); updateDate(next); } }
  function reload() { setError(''); setLoadError(''); setRevision(n => n + 1); }
  const refresh = useCallback(() => {
    if (locked.current) return;
    const version = ++requestVersion.current;
    api<Day>(`/entries?date=${key}`).then(result => { if (version === requestVersion.current && !locked.current) { setDay(result); setLoadError(''); } }).catch(e => { if (version === requestVersion.current && !locked.current) setLoadError(e.message); });
  }, [api, key]);
  useEffect(() => {
    refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh, revision]);
  useForegroundRefresh(refresh);
  async function mutate(entry?: Entry) {
    if (locked.current) return;
    if (!entry && (!name.trim() || !/^\d+$/.test(calories) || Number(calories) > 100000 || !validMacros(macroDraft))) {
      setError('Enter a name, whole-number calories, and optional macros from 0–100,000 g.'); return;
    }
    locked.current = true; requestVersion.current += 1; setBusy(true); setError('');
    try {
      if (entry) {
        await api<void>(`/entries/${entry.id}`, { method: 'DELETE' });
        setDay(old => old && ({ entries: old.entries.filter(e => e.id !== entry.id), total: old.total - entry.calories }));
      } else {
        const added = await api<Entry>('/entries', { method: 'POST', body: JSON.stringify({ name, calories: Number(calories), date: key, ...parseMacros(macroDraft) }) });
        setDay(old => old && ({ entries: [...old.entries, added], total: old.total + added.calories }));
        setName(''); setCalories(''); setMacroDraft(emptyMacros);
      }
    } catch(e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { locked.current = false; setBusy(false); }
  }
  const partialMacros = day?.entries.some(entry => entry.protein == null || entry.carbs == null || entry.fat == null);
  function macroTotal(macro: 'protein' | 'carbs' | 'fat') {
    if (!day || (day.entries.length > 0 && day.entries.every(entry => entry[macro] == null))) return '—';
    return `${day.entries.reduce((sum, entry) => sum + (entry[macro] ?? 0), 0).toFixed(1)} g`;
  }
  return <SafeAreaView style={common.screen}><KeyboardAvoidingView style={common.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={common.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader title="Food" />
    <DateNavigation date={date} disabled={busy} onChange={next => { if (!locked.current) setDate(next); }} />
    {!!(error || loadError) && <View style={s.errorCard}><Text accessibilityRole="alert" style={common.error}>{error || loadError}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={reload} style={common.textButton}><Text style={common.link}>Retry</Text></Pressable></View>}
    <View style={common.card}>
      <Text style={common.label}>Calories</Text>
      <Text style={s.total} accessibilityLiveRegion="polite">{day ? day.total.toLocaleString() : '—'} <Text style={s.unit}>kcal</Text></Text>
      <View style={s.macros}>{(['protein', 'carbs', 'fat'] as const).map(macro => <View key={macro} style={s.macro}><Text style={common.label}>{macro[0].toUpperCase() + macro.slice(1)}</Text><Text style={s.macroValue}>{macroTotal(macro)}</Text></View>)}</View>
      {partialMacros && <Text style={common.secondary}>Macro totals are incomplete.</Text>}
      {!day && <Text style={common.secondary}>{error || loadError ? 'Diary unavailable' : 'Loading…'}</Text>}
    </View>
    <View style={common.card}>
      <View style={common.listHeader}><Text style={common.heading}>Add food</Text>{mode === 'search' && <Text style={s.source}>USDA</Text>}</View>
      <View style={s.modes} accessibilityRole="tablist">{([['search', 'Search'], ['quick', 'Quick add']] as const).map(([value, label]) =>
        <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} disabled={busy} style={[s.mode, mode === value && s.modeSelected]} onPress={() => { setMode(value); setError(''); }}>
          <Text style={[s.modeText, mode === value && s.modeTextSelected]}>{label}</Text></Pressable>)}</View>
      {/* key resets the search when the diary date changes, as the old standalone card did. */}
      {mode === 'search' ? <IngredientSearch key={key} embedded date={key} onAdded={reload} /> : <>
      <View style={common.field}><Text style={common.label}>Name</Text><TextInput accessibilityLabel="Food name" style={common.input} value={name} onChangeText={setName} placeholder="Avocado toast" placeholderTextColor={colors.placeholder} maxLength={120} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <View style={common.field}><Text style={common.label}>Calories (kcal)</Text><TextInput accessibilityLabel="Calories" style={common.input} value={calories} onChangeText={setCalories} placeholder="320" placeholderTextColor={colors.placeholder} keyboardType="number-pad" maxLength={6} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <NutritionFields values={macroDraft} onChange={setMacroDraft} disabled={busy} />
      <Pressable accessibilityRole="button" disabled={busy || !day} style={[common.button, (busy || !day) && common.disabled]} onPress={() => mutate()}><Text style={common.buttonText}>{busy ? 'Saving…' : 'Add food'}</Text></Pressable>
      </>}
    </View>
    <CustomFoods key={`custom:${key}`} date={key} onLogged={reload} />
    <View style={common.card}>
      <View style={common.listHeader}><Text style={common.heading}>Entries</Text><Pressable accessibilityRole="button" disabled={busy} onPress={reload} style={common.textButton}><Text style={common.link}>Refresh</Text></Pressable></View>
      {day?.entries.length === 0 && <Text style={common.empty}>No food logged.</Text>}
      {day?.entries.map(entry => <View key={entry.id} style={common.listRow}><LogTime value={entry.createdAt} /><View style={common.item}><Text style={common.text}>{entry.name}</Text><Text style={common.secondary}>{entry.calories.toLocaleString()} kcal</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${entry.name}`} disabled={busy} style={common.textButton} onPress={() => mutate(entry)}><Text style={common.deleteText}>Delete</Text></Pressable></View>)}
    </View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export default function App() { return <SafeAreaProvider><Diary/></SafeAreaProvider>; }
const styles = (colors: Colors) => StyleSheet.create({
  total: { color: colors.text, fontSize: 46, fontWeight: '600', letterSpacing: -1.5, marginTop: -6 },
  unit: { color: colors.secondary, fontSize: 17, fontWeight: '400', letterSpacing: 0 },
  macros: { flexDirection: 'row', borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  macro: { flex: 1, gap: 5 },
  macroValue: { color: colors.text, fontSize: 17, fontWeight: '500' },
  errorCard: { backgroundColor: colors.dangerSurface, borderRadius: 12, padding: 14 },
  source: { color: colors.secondary, fontSize: 12 },
  // Segmented control styled like the lb/kg toggle on the Lifts screen.
  modes: { flexDirection: 'row', backgroundColor: colors.background === '#000000' ? '#2c2c2e' : colors.background, borderRadius: 9, padding: 3 },
  mode: { flex: 1, minHeight: 36, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  modeSelected: { backgroundColor: colors.accentSurface },
  modeText: { color: colors.secondary, fontSize: 14 },
  modeTextSelected: { color: colors.accent, fontWeight: '600' },
});
