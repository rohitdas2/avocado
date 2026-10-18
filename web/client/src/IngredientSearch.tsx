import { useEffect, useRef, useState } from 'react';
import { request } from './api';

type Food = { id: number; name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

// Mirrors mobile/IngredientSearch.tsx (embedded in the Add food card): search → pick a result →
// enter a serving size in grams → review the scaled calories and macros → confirm. Reuses
// GET /api/foods/search (per-100 g values from the server) and POST /api/entries; nothing is
// saved until the user confirms. Results stay listed after adding, so similar foods are one click away.
export default function IngredientSearch({ date, onAdded }: { date: string; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
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

  const amount = Number(grams);
  const validAmount = Number.isInteger(amount) && amount >= 1 && amount <= 10000;
  const scaled = (value: number | null) => value === null || !validAmount ? null : Math.round(value * amount / 100 * 10) / 10;

  async function add() {
    if (!selected || selected.calories === null || !validAmount || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      await request('/entries', { method: 'POST', signal: lifecycle.current?.signal, body: JSON.stringify({ name: `${selected.name.slice(0, 96)} (${grams} g)`, calories: Math.round(selected.calories * amount / 100), protein: scaled(selected.protein), carbs: scaled(selected.carbs), fat: scaled(selected.fat), date }) });
      setSelected(null); onAdded();
    } catch (e) { if (!lifecycle.current?.signal.aborted) setError((e as Error).message); }
    finally { lock.current = false; if (!lifecycle.current?.signal.aborted) setBusy(false); }
  }

  const cannotAdd = busy || selected?.calories == null || !validAmount;
  const kcal = selected?.calories != null && validAmount ? Math.round(selected.calories * amount / 100) : null;
  return <div className="ingredient-search">
    <form className="search-row" onSubmit={search}>
      <input aria-label="Search ingredients" placeholder="Search ingredients" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} maxLength={100} />
      <button className="quiet search-link" disabled={busy || query.trim().length < 2}>{busy ? 'Searching…' : 'Search'}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {foods.length > 0 && <div className="results">{foods.map(food => <button key={food.id} type="button" className={`result${selected?.id === food.id ? ' chosen' : ''}`} aria-pressed={selected?.id === food.id} disabled={busy} onClick={() => { setSelected(food); setGrams('100'); }}>
      <span>{food.name}</span><small>{food.calories === null ? 'Calories unavailable' : `${food.calories} kcal / 100 g`}</small>
    </button>)}</div>}
    {searched && !foods.length && <p className="caption">No ingredients found.</p>}
    {selected && <div className="portion">
      <h3>{selected.name}</h3>
      <label htmlFor="portion-grams">Serving size (g)</label>
      <input id="portion-grams" aria-label="Portion in grams" inputMode="numeric" maxLength={5} value={grams} disabled={busy} onChange={event => setGrams(event.target.value)} />
      {!validAmount && <p className="error" role="alert">Enter 1–10,000 g.</p>}
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
