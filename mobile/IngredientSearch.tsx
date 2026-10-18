import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import useScopedApi from './useScopedApi';
import { type Colors, useTheme } from './theme';

type Food = { id: number; name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

export default function IngredientSearch({ date, onAdded }: { date: string; onAdded: () => void }) {
  const api = useScopedApi();
  const { colors, common, dark } = useTheme();
  const s = styles(colors);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const lock = useRef(false);
  async function search() {
    setBusy(true); setError(''); setSelected(null);
    try { setFoods((await api<{ foods: Food[] }>(`/foods/search?q=${encodeURIComponent(query)}`)).foods); setSearched(true); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const amount = Number(grams);
  const validAmount = Number.isInteger(amount) && amount >= 1 && amount <= 10000;
  const scaled = (value: number | null) => value === null || !validAmount ? null : Math.round(value * amount / 100 * 10) / 10;
  async function add() {
    if (!selected || selected.calories === null || !validAmount || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await api('/entries', { method: 'POST', body: JSON.stringify({ name: `${selected.name.slice(0, 96)} (${grams} g)`, calories: Math.round(selected.calories * amount / 100), protein: scaled(selected.protein), carbs: scaled(selected.carbs), fat: scaled(selected.fat), date }) });
      setSelected(null); onAdded();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); lock.current = false; }
  }
  const cannotAdd = busy || selected?.calories == null || !validAmount;
  return <View style={common.card}>
    <View style={common.listHeader}><Text style={common.heading}>Ingredients</Text><Text style={s.source}>USDA</Text></View>
    <View style={common.row}>
      <TextInput style={[common.input, s.searchInput]} accessibilityLabel="Search ingredients" placeholder="Search ingredients" placeholderTextColor={colors.placeholder} value={query} onChangeText={setQuery} maxLength={100} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} returnKeyType="search" onSubmitEditing={() => { if (!busy && query.trim().length >= 2) void search(); }} />
      <Pressable accessibilityRole="button" disabled={busy || query.trim().length < 2} style={[s.searchButton, (busy || query.trim().length < 2) && common.disabled]} onPress={search}><Text style={common.link}>{busy ? 'Searching…' : 'Search'}</Text></Pressable>
    </View>
    {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
    {foods.map(food => <Pressable accessibilityRole="button" accessibilityState={{ selected: selected?.id === food.id }} key={food.id} disabled={busy} style={[s.result, selected?.id === food.id && s.selected]} onPress={() => { setSelected(food); setGrams('100'); }}><Text style={common.text}>{food.name}</Text><Text style={common.secondary}>{food.calories === null ? 'Calories unavailable' : `${food.calories} kcal / 100 g`}</Text></Pressable>)}
    {searched && !foods.length && <Text style={common.secondary}>No ingredients found.</Text>}
    {selected && <View style={s.portion}>
      <Text style={common.heading}>{selected.name}</Text>
      <View style={common.field}><Text style={common.label}>Portion (g)</Text><TextInput style={common.input} accessibilityLabel="Portion in grams" keyboardType="number-pad" keyboardAppearance={dark ? 'dark' : 'light'} value={grams} onChangeText={setGrams} maxLength={5} editable={!busy} /></View>
      {!validAmount && <Text style={common.error}>Enter 1–10,000 g.</Text>}
      <Text style={common.secondary}>{selected.calories === null ? 'Calories unavailable' : validAmount ? `${Math.round(selected.calories * amount / 100)} kcal` : '— kcal'} · Protein {scaled(selected.protein) ?? '—'} g · Carbs {scaled(selected.carbs) ?? '—'} g · Fat {scaled(selected.fat) ?? '—'} g</Text>
      {(selected.protein === null || selected.carbs === null || selected.fat === null) && <Text style={common.secondary}>— = unavailable</Text>}
      <Pressable accessibilityRole="button" style={[common.button, cannotAdd && common.disabled]} disabled={cannotAdd} onPress={add}><Text style={common.buttonText}>{busy ? 'Adding…' : 'Add ingredient'}</Text></Pressable>
    </View>}
  </View>;
}

const styles = (colors: Colors) => StyleSheet.create({
  source: { color: colors.secondary, fontSize: 12 },
  searchInput: { flex: 1 },
  searchButton: { minHeight: 44, paddingHorizontal: 2, justifyContent: 'center' },
  result: { padding: 10, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, borderRadius: 8 },
  selected: { backgroundColor: colors.accentSurface },
  portion: { gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, paddingTop: 16 },
});
