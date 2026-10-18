import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import useScopedApi from './useScopedApi';
import { type Colors, useTheme } from './theme';
import { portionServing, type Portion } from './workoutLogic';

type Food = { id: number; name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

// USDA mode of the Add food card: search → pick a result → choose grams or a USDA household portion
// ("1 large", from GET /api/foods/{id}/portions when a result is chosen) and an amount →
// review the scaled calories and macros → confirm. Reuses GET /api/foods/search (per-100 g
// values from the server) and POST /api/entries; nothing is saved until the user confirms.
// `embedded` drops this component's own card so App.tsx can host it inside the Add food card.
export default function IngredientSearch({ date, onAdded, embedded = false }: { date: string; onAdded: () => void; embedded?: boolean }) {
  const api = useScopedApi();
  const { colors, common, dark } = useTheme();
  const s = styles(colors);
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
  // null while loading; a failed load leaves grams only, with a note.
  const [portions, setPortions] = useState<Portion[] | null>(null);
  const [portionError, setPortionError] = useState('');
  const [portion, setPortion] = useState<Portion | null>(null);
  const [amountText, setAmountText] = useState('1');
  const portionRequest = useRef(0);
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
  function choose(food: Food) {
    setSelected(food); setGrams('100'); setPortion(null); setAmountText('1'); setPortions(null); setPortionError('');
    const request = ++portionRequest.current;
    api<{ portions: Portion[] }>(`/foods/${food.id}/portions`)
      .then(result => { if (request === portionRequest.current) setPortions(result.portions); })
      .catch(e => { if (request === portionRequest.current) { setPortions([]); setPortionError((e as Error).message); } });
  }
  // Grams come from the gram field, or from amount × the chosen portion's weight.
  const serving = portion ? portionServing(amountText, portion) : null;
  const typedGrams = Number(grams);
  const amount = portion ? serving?.grams ?? null : Number.isInteger(typedGrams) && typedGrams >= 1 && typedGrams <= 10000 ? typedGrams : null;
  const validAmount = amount !== null;
  const scaled = (value: number | null) => value === null || amount === null ? null : Math.round(value * amount / 100 * 10) / 10;
  async function add() {
    if (!selected || selected.calories === null || !validAmount || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const label = serving ? `${serving.label}, ${amount} g` : `${amount} g`;
      await api('/entries', { method: 'POST', body: JSON.stringify({ name: `${selected.name.slice(0, 116 - label.length)} (${label})`, calories: Math.round(selected.calories * amount! / 100), protein: scaled(selected.protein), carbs: scaled(selected.carbs), fat: scaled(selected.fat), date }) });
      setSelected(null); onAdded();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); lock.current = false; }
  }
  const cannotAdd = busy || selected?.calories == null || !validAmount;
  const kcal = selected?.calories != null && amount !== null ? Math.round(selected.calories * amount / 100) : null;
  return <View style={embedded ? s.embedded : common.card}>
    {!embedded && <View style={common.listHeader}><Text style={common.heading}>Ingredients</Text><Text style={s.source}>USDA</Text></View>}
    <View style={common.row}>
      <TextInput style={[common.input, s.searchInput]} accessibilityLabel="Search ingredients" placeholder="Search ingredients" placeholderTextColor={colors.placeholder} value={query} onChangeText={setQuery} maxLength={100} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} returnKeyType="search" onSubmitEditing={() => { if (!busy && query.trim().length >= 2) void search(); }} />
      <Pressable accessibilityRole="button" disabled={busy || query.trim().length < 2} style={[s.searchButton, (busy || query.trim().length < 2) && common.disabled]} onPress={search}><Text style={common.link}>{busy ? 'Searching…' : 'Search'}</Text></Pressable>
    </View>
    {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
    {foods.map(food => <Pressable accessibilityRole="button" accessibilityState={{ selected: selected?.id === food.id }} key={food.id} disabled={busy} style={[s.result, selected?.id === food.id && s.selected]} onPress={() => choose(food)}><Text style={common.text}>{food.name}</Text><Text style={common.secondary}>{food.calories === null ? 'Calories unavailable' : `${food.calories} kcal / 100 g`}</Text></Pressable>)}
    {searched && !foods.length && <Text style={common.secondary}>No ingredients found.</Text>}
    {selected && <View style={s.portion}>
      <Text style={common.heading}>{selected.name}</Text>
      <View style={common.field}>
        <Text style={common.label}>Serving</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityRole="radiogroup">
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: !portion }} disabled={busy} style={[s.chip, !portion && s.chipOn]} onPress={() => setPortion(null)}><Text style={[s.chipLabel, !portion && s.chipLabelOn]}>Grams</Text><Text style={common.text}>g</Text></Pressable>
          {portions?.map(item => <Pressable key={item.label} accessibilityRole="radio" accessibilityLabel={`${item.label}, ${item.grams} grams`} accessibilityState={{ checked: portion?.label === item.label }} disabled={busy} style={[s.chip, portion?.label === item.label && s.chipOn]} onPress={() => { setPortion(item); setAmountText('1'); }}>
            <Text style={[s.chipLabel, portion?.label === item.label && s.chipLabelOn]}>{portionServing('1', item)?.unit ?? item.label}</Text><Text style={common.text}>{item.grams} g</Text>
          </Pressable>)}
        </ScrollView>
        {portions === null && <Text style={common.secondary}>Loading serving sizes…</Text>}
        {!!portionError && <Text style={common.secondary}>{portionError}</Text>}
      </View>
      {portion ? <View style={common.field}>
        <Text style={common.label}>Amount · {portion.label}</Text>
        <TextInput style={common.input} accessibilityLabel={`Number of ${portion.label}`} keyboardType="decimal-pad" keyboardAppearance={dark ? 'dark' : 'light'} value={amountText} onChangeText={setAmountText} maxLength={6} editable={!busy} />
        {serving ? <Text style={common.secondary}>= {serving.grams} g</Text> : <Text style={common.error}>Enter an amount above 0 and up to 100.</Text>}
      </View> : <>
        <View style={common.field}><Text style={common.label}>Serving size (g)</Text><TextInput style={common.input} accessibilityLabel="Portion in grams" keyboardType="number-pad" keyboardAppearance={dark ? 'dark' : 'light'} value={grams} onChangeText={setGrams} maxLength={5} editable={!busy} /></View>
        {!validAmount && <Text style={common.error}>Enter 1–10,000 g.</Text>}
      </>}
      {/* Preview of exactly what will be saved, recalculated as the serving size changes. */}
      <View style={s.preview} accessibilityLiveRegion="polite">
        {([['Calories', kcal === null ? '—' : `${kcal} kcal`], ['Protein', `${scaled(selected.protein) ?? '—'} g`], ['Carbs', `${scaled(selected.carbs) ?? '—'} g`], ['Fat', `${scaled(selected.fat) ?? '—'} g`]] as const).map(([label, value]) =>
          <View key={label} style={s.previewItem}><Text style={common.label}>{label}</Text><Text style={common.text}>{value}</Text></View>)}
      </View>
      {selected.calories === null && <Text style={common.secondary}>USDA has no calorie value for this food, so it can’t be added. Use Quick add instead.</Text>}
      {(selected.protein === null || selected.carbs === null || selected.fat === null) && <Text style={common.secondary}>— = unavailable</Text>}
      <Pressable accessibilityRole="button" style={[common.button, cannotAdd && common.disabled]} disabled={cannotAdd} onPress={add}><Text style={common.buttonText}>{busy ? 'Adding…' : kcal === null ? 'Add food' : `Add ${kcal} kcal`}</Text></Pressable>
    </View>}
  </View>;
}

const styles = (colors: Colors) => StyleSheet.create({
  source: { color: colors.secondary, fontSize: 12 },
  embedded: { gap: 14 },
  preview: { flexDirection: 'row', gap: 8 },
  previewItem: { flex: 1, gap: 4 },
  searchInput: { flex: 1 },
  searchButton: { minHeight: 44, paddingHorizontal: 2, justifyContent: 'center' },
  result: { padding: 10, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, borderRadius: 8 },
  selected: { backgroundColor: colors.accentSurface },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, minHeight: 44, gap: 2 },
  chipOn: { backgroundColor: colors.accentSurface, borderColor: colors.accentSurface },
  chipLabel: { color: colors.secondary, fontSize: 12, fontWeight: '600' },
  chipLabelOn: { color: colors.accent },
  portion: { gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, paddingTop: 16 },
});
