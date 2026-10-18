import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import useScopedApi from './useScopedApi';
import NutritionFields, { emptyMacros, parseMacros, validMacros, type MacroDraft } from './NutritionFields';
import { useTheme } from './theme';
import useForegroundRefresh from './useForegroundRefresh';

type CustomFood = { id: string; name: string; calories: number; protein: number | null; carbs: number | null; fat: number | null };

export default function CustomFoods({ date, onLogged }: { date: string; onLogged: () => void }) {
  const api = useScopedApi();
  const { colors, common, dark } = useTheme();
  const [foods, setFoods] = useState<CustomFood[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [macros, setMacros] = useState<MacroDraft>(emptyMacros);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const lock = useRef(false);
  const version = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(() => {
    if (lock.current) return;
    const request = ++version.current;
    api<{ foods: CustomFood[] }>('/custom-foods').then(result => { if (mounted.current && request === version.current) setFoods(result.foods); }).catch(e => { if (mounted.current && request === version.current) setError(e.message); });
  }, [api]);
  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; version.current += 1; }; }, [refresh]);
  useForegroundRefresh(refresh);
  async function perform(action: () => Promise<void>, message: string) {
    if (lock.current) return;
    lock.current = true; version.current += 1; setBusy(true); setError(''); setStatus('');
    try { await action(); if (mounted.current) setStatus(message); }
    catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function save() {
    if (!name.trim() || !/^\d+$/.test(calories) || Number(calories) > 100000 || !validMacros(macros)) { setError('Enter a name, whole-number calories, and optional macros from 0–100,000 g.'); return; }
    void perform(async () => {
      const food = await api<CustomFood>('/custom-foods', { method: 'POST', body: JSON.stringify({ name: name.trim(), calories: Number(calories), ...parseMacros(macros) }) });
      if (!mounted.current) return;
      setFoods(old => [...(old || []), food]); setCreating(false); setName(''); setCalories(''); setMacros(emptyMacros);
    }, 'Food saved.');
  }
  function log(food: CustomFood) {
    void perform(async () => {
      await api('/entries', { method: 'POST', body: JSON.stringify({ name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, date }) });
      if (mounted.current) onLogged();
    }, `${food.name} added.`);
  }
  function remove(food: CustomFood) {
    void perform(async () => { await api(`/custom-foods/${food.id}`, { method: 'DELETE' }); if (mounted.current) setFoods(old => old?.filter(value => value.id !== food.id) || []); }, 'Food removed from your saved foods.');
  }
  return <View style={common.card}>
    <View style={common.listHeader}><Text style={common.heading}>Custom foods</Text><Pressable accessibilityRole="button" disabled={busy} style={common.textButton} onPress={() => { setCreating(!creating); setError(''); setStatus(''); }}><Text style={common.link}>{creating ? 'Cancel' : 'New food'}</Text></Pressable></View>
    {creating && <View style={{ gap: 14 }}>
      <Text style={common.secondary}>Nutrition per serving</Text>
      <View style={common.field}><Text style={common.label}>Name</Text><TextInput accessibilityLabel="Custom food name" style={common.input} value={name} onChangeText={setName} maxLength={120} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <View style={common.field}><Text style={common.label}>Calories (kcal)</Text><TextInput accessibilityLabel="Custom food calories per serving" style={common.input} value={calories} onChangeText={setCalories} maxLength={6} keyboardType="number-pad" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} placeholder="320" placeholderTextColor={colors.placeholder} /></View>
      <NutritionFields values={macros} onChange={setMacros} disabled={busy} />
      <Pressable accessibilityRole="button" disabled={busy} style={[common.button, busy && common.disabled]} onPress={save}><Text style={common.buttonText}>{busy ? 'Saving…' : 'Save food'}</Text></Pressable>
    </View>}
    {!foods && !error && <Text style={common.secondary}>Loading…</Text>}
    {foods?.length === 0 && !creating && <Text style={common.secondary}>No custom foods yet.</Text>}
    {foods?.map(food => <View key={food.id} style={[common.listRow, { flexWrap: 'wrap' }]}>
      <View style={[common.item, { minWidth: 140 }]}><Text style={common.text}>{food.name}</Text><Text style={common.secondary}>{food.calories.toLocaleString()} kcal · 1 serving</Text><Text style={common.secondary}>P {food.protein ?? '—'} · C {food.carbs ?? '—'} · F {food.fat ?? '—'} g</Text></View>
      <View style={[common.row, { gap: 10 }]}><Pressable accessibilityRole="button" accessibilityLabel={`Log one serving of ${food.name}`} disabled={busy} style={common.textButton} onPress={() => log(food)}><Text style={common.link}>Log</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete custom food ${food.name}`} disabled={busy} style={common.textButton} onPress={() => remove(food)}><Text style={common.deleteText}>Delete</Text></Pressable></View>
    </View>)}
    {!!error && <View style={{ gap: 4 }}><Text accessibilityRole="alert" style={common.error}>{error}</Text>{!foods && <Pressable accessibilityRole="button" onPress={refresh} style={common.textButton}><Text style={common.link}>Retry</Text></Pressable>}</View>}
    {!!status && <Text accessibilityLiveRegion="polite" style={common.secondary}>{status}</Text>}
  </View>;
}
