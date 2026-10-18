import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { request } from './api';

export type Food = { id: number; name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };

export function IngredientSearch({ date, onAdded }: { date: string; onAdded: () => void }) {
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
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setSelected(null);
    try {
      setFoods((await request<{ foods: Food[] }>(`/foods/search?q=${encodeURIComponent(query)}`, { signal: lifecycle.current?.signal })).foods);
      setSearched(true);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  const amount = Number(grams);
  const validAmount = Number.isInteger(amount) && amount >= 1 && amount <= 10000;
  // USDA nutrients are per 100g. Unknown values stay unknown, rather than zero.
  const scaled = (value: number | null) => value === null || !validAmount ? '—' : Math.round(value * amount / 100 * 10) / 10;

  async function add() {
    if (!selected || selected.calories === null || !validAmount || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const macro = (value: number | null) => value === null ? null : Math.round(value * amount / 100 * 10) / 10;
      await request('/entries', { method: 'POST', signal: lifecycle.current?.signal, body: JSON.stringify({ name: `${selected.name.slice(0, 96)} (${grams} g)`, calories: Math.round(selected.calories * amount / 100), protein: macro(selected.protein), carbs: macro(selected.carbs), fat: macro(selected.fat), date }) });
      setSelected(null); setFoods([]); setQuery(''); setSearched(false); onAdded();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  return <section className="card nutrition">
    <h2>Ingredients</h2>
    <form className="search-row" onSubmit={search}>
      <input aria-label="Search ingredients" placeholder="Search ingredients" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} minLength={2} maxLength={100} required />
      <button className="search-button icon-button" aria-label="Search" disabled={busy || query.trim().length < 2}><Icon name="search" /></button>
    </form>
    <p className="caption source">USDA FoodData Central</p>
    {busy && <p className="caption" role="status">Working…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!selected && foods.length > 0 && <div className="results">{foods.map(food => <button key={food.id} className="result" disabled={busy} onClick={() => { setSelected(food); setGrams('100'); }}><span>{food.name}</span><small>{food.calories ?? '—'} kcal / 100 g</small></button>)}</div>}
    {searched && !foods.length && <p className="caption">No matches. Try another ingredient.</p>}
    {selected && <div className="portion">
      <div className="section-heading"><h3>{selected.name}</h3><button className="quiet icon-button" disabled={busy} aria-label="Change ingredient" onClick={() => setSelected(null)}><Icon name="close" /></button></div>
      <p className="caption">Check the raw or cooked description.</p>
      <label htmlFor="grams">Portion <span className="muted">(g)</span></label><input id="grams" type="number" min="1" max="10000" step="1" value={grams} disabled={busy} onChange={event => setGrams(event.target.value)} />
      <dl className="portion-macros"><div><dt>Calories</dt><dd>{selected.calories === null || !validAmount ? '—' : Math.round(selected.calories * amount / 100)} <span>kcal</span></dd></div>{(['protein', 'carbs', 'fat'] as const).map(key => <div key={key}><dt>{key}</dt><dd>{scaled(selected[key])} <span>g</span></dd></div>)}</dl>
      {selected.calories === null && <p className="caption">Calories unavailable.</p>}
      <button className="primary" disabled={busy || selected.calories === null || !validAmount} onClick={add}><Icon name="plus" />Add ingredient</button>
    </div>}
  </section>;
}
