import { useEffect, useRef, useState } from 'react';
import { request } from './api';
import { portionServing, type Portion } from './workoutLogic';

type Food = { id: number; name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

// Mirrors mobile/IngredientSearch.tsx (embedded in the Add food card): search → pick a result →
// choose grams or a USDA household portion ("1 large", read from GET /api/foods/{id}/portions when
// a result is chosen) and an amount → review the scaled calories and macros → confirm. Reuses
// GET /api/foods/search (per-100 g values from the server) and POST /api/entries; nothing is
// saved until the user confirms. Results stay listed after adding, so similar foods are one click away.
export default function IngredientSearch({ date, onAdded }: { date: string; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
  // null while loading; a failed load leaves grams only, with a note.
  const [portions, setPortions] = useState<Portion[] | null>(null);
  const [portionError, setPortionError] = useState('');
  const [portion, setPortion] = useState<Portion | null>(null);
  const [amount, setAmount] = useState('1');
  const portionRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const lock = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || query.trim().length < 2) return;
    lock.current = true; setBusy(true); setError(''); setSelected(null);
    try { setFoods((await request<{ foods: Food[] }>(`/foods/search?q=${encodeURIComponent(query)}`, { signal: lifecycle.current?.signal })).foods); setSearched(true); }
    catch (e) { if (!lifecycle.current?.signal.aborted) setError((e as Error).message); }
    finally { lock.current = false; if (!lifecycle.current?.signal.aborted) setBusy(false); }
  }

  function choose(food: Food) {
    setSelected(food); setGrams('100'); setPortion(null); setAmount('1'); setPortions(null); setPortionError('');
    portionRequest.current?.abort();
    const controller = new AbortController();
    portionRequest.current = controller;
    lifecycle.current?.signal.addEventListener('abort', () => controller.abort(), { once: true });
    request<{ portions: Portion[] }>(`/foods/${food.id}/portions`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setPortions(result.portions); })
      .catch(e => { if (!controller.signal.aborted) { setPortions([]); setPortionError((e as Error).message); } });
  }

  // Grams come from the gram field, or from amount × the chosen portion's weight.
  const serving = portion ? portionServing(amount, portion) : null;
  const typedGrams = Number(grams);
  const servingGrams = portion ? serving?.grams ?? null : Number.isInteger(typedGrams) && typedGrams >= 1 && typedGrams <= 10000 ? typedGrams : null;
  const validAmount = servingGrams !== null;
  const scaled = (value: number | null) => value === null || servingGrams === null ? null : Math.round(value * servingGrams / 100 * 10) / 10;

  async function add() {
    if (!selected || selected.calories === null || !validAmount || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const label = serving ? `${serving.label}, ${servingGrams} g` : `${servingGrams} g`;
      await request('/entries', { method: 'POST', signal: lifecycle.current?.signal, body: JSON.stringify({ name: `${selected.name.slice(0, 116 - label.length)} (${label})`, calories: Math.round(selected.calories * servingGrams! / 100), protein: scaled(selected.protein), carbs: scaled(selected.carbs), fat: scaled(selected.fat), date }) });
      setSelected(null); onAdded();
    } catch (e) { if (!lifecycle.current?.signal.aborted) setError((e as Error).message); }
    finally { lock.current = false; if (!lifecycle.current?.signal.aborted) setBusy(false); }
  }

  const cannotAdd = busy || selected?.calories == null || !validAmount;
  const kcal = selected?.calories != null && servingGrams !== null ? Math.round(selected.calories * servingGrams / 100) : null;
  return <div className="ingredient-search">
    <form className="search-row" onSubmit={search}>
      <input aria-label="Search ingredients" placeholder="Search ingredients" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} maxLength={100} />
      <button className="quiet search-link" disabled={busy || query.trim().length < 2}>{busy ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {foods.length > 0 && <div className="results">{foods.map(food => <button key={food.id} type="button" className={`result${selected?.id === food.id ? ' chosen' : ''}`} aria-pressed={selected?.id === food.id} disabled={busy} onClick={() => choose(food)}>
      <span>{food.name}</span><small>{food.calories === null ? 'Calories unavailable' : `${food.calories} kcal / 100 g`}</small>
    </button>)}</div>}
    {searched && !foods.length && <p className="caption">No ingredients found.</p>}
    {selected && <div className="portion">
      <h3>{selected.name}</h3>
      <p className="field-label">Serving</p>
      <div className="chips portion-chips" role="radiogroup" aria-label="Serving unit">
        <button type="button" role="radio" aria-checked={!portion} className={`chip${!portion ? ' accent' : ''}`} disabled={busy} onClick={() => setPortion(null)}><span>Grams</span>g</button>
        {portions?.map(item => <button type="button" key={item.label} role="radio" aria-checked={portion?.label === item.label} className={`chip${portion?.label === item.label ? ' accent' : ''}`} disabled={busy} title={item.label} onClick={() => { setPortion(item); setAmount('1'); }}>
          <span>{portionServing('1', item)?.unit ?? item.label}</span>{item.grams} g
        </button>)}
      </div>
      {portions === null && <p className="caption" role="status">Loading serving sizes…</p>}
      {portionError && <p className="caption">{portionError}</p>}
      {portion ? <>
        <label htmlFor="portion-amount">Amount · {portion.label}</label>
        <input id="portion-amount" aria-label={`Number of ${portion.label}`} inputMode="decimal" maxLength={6} value={amount} disabled={busy} onChange={event => setAmount(event.target.value)} />
        {serving ? <p className="caption portion-total">= {serving.grams} g</p> : <p className="error" role="alert">Enter an amount above 0 and up to 100.</p>}
      </> : <>
        <label htmlFor="portion-grams">Serving size (g)</label>
        <input id="portion-grams" aria-label="Portion in grams" inputMode="numeric" maxLength={5} value={grams} disabled={busy} onChange={event => setGrams(event.target.value)} />
        {!validAmount && <p className="error" role="alert">Enter 1–10,000 g.</p>}
      </>}
      {/* Preview of exactly what will be saved, recalculated as the serving size changes. */}
      <dl className="portion-macros" aria-live="polite">
        {([['Calories', kcal === null ? '—' : `${kcal} kcal`], ['Protein', `${scaled(selected.protein) ?? '—'} g`], ['Carbs', `${scaled(selected.carbs) ?? '—'} g`], ['Fat', `${scaled(selected.fat) ?? '—'} g`]] as const).map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {selected.calories === null && <p className="caption">USDA has no calorie value for this food, so it can’t be added. Use Quick add instead.</p>}
      {(selected.protein === null || selected.carbs === null || selected.fat === null) && <p className="caption">— = unavailable</p>}
      <button className="primary" type="button" disabled={cannotAdd} onClick={add}>{busy ? 'Adding…' : kcal === null ? 'Add food' : `Add ${kcal} kcal`}</button>
    </div>}
  </div>;
}
