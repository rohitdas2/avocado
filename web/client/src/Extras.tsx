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

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setSelected(null);
    try {
      setFoods((await request<{ foods: Food[] }>(`/foods/search?q=${encodeURIComponent(query)}`)).foods);
      setSearched(true);
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  const amount = Number(grams);
  const validAmount = Number.isInteger(amount) && amount >= 1 && amount <= 10000;
  const scaled = (value: number | null) => value === null || !validAmount ? '—' : Math.round(value * amount / 100 * 10) / 10;

  async function add() {
    if (!selected || selected.calories === null || !validAmount || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const macro = (value: number | null) => value === null ? null : Math.round(value * amount / 100 * 10) / 10;
      await request('/entries', { method: 'POST', body: JSON.stringify({ name: `${selected.name.slice(0, 96)} (${grams} g)`, calories: Math.round(selected.calories * amount / 100), protein: macro(selected.protein), carbs: macro(selected.carbs), fat: macro(selected.fat), date }) });
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

type Lift = { id: string; exercise: string; weight: number; unit: string; sets: number; reps: number };

export function Lifts({ date }: { date: string }) {
  const [entries, setEntries] = useState<Lift[] | null>(null);
  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState('lb');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setEntries(null); setError('');
    request<{ entries: Lift[] }>(`/lifts?date=${date}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setEntries(data.entries); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [date, revision]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const lift = await request<Lift>('/lifts', { method: 'POST', body: JSON.stringify({ exercise, weight: Number(weight), unit, sets: Number(sets), reps: Number(reps), date }) });
      setEntries(old => [...(old || []), lift]); setExercise('');
    } catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  async function remove(id: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await request(`/lifts/${id}`, { method: 'DELETE' }); setEntries(old => old?.filter(entry => entry.id !== id) || []); }
    catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  return <>
    {error && <div className="error" role="alert">{error}{!entries && <button className="quiet" disabled={busy} onClick={() => setRevision(n => n + 1)}>Retry</button>}</div>}
    <div className="food-layout lift-layout">
      <section className="card lift-form"><h2>Log a lift</h2><form onSubmit={save}>
        <label htmlFor="exercise">Exercise</label><input id="exercise" value={exercise} disabled={busy} onChange={event => setExercise(event.target.value)} placeholder="Squat" required maxLength={120} />
        <div className="lift-fields">
          <label htmlFor="weight">Weight<input id="weight" type="number" min="0" max="10000" step="0.1" required disabled={busy} value={weight} onChange={event => setWeight(event.target.value)} placeholder="0" /></label>
          <label htmlFor="unit">Unit<select id="unit" disabled={busy} value={unit} onChange={event => setUnit(event.target.value)}><option>lb</option><option>kg</option></select></label>
          <label htmlFor="sets">Sets<input id="sets" type="number" min="1" max="100" required disabled={busy} value={sets} onChange={event => setSets(event.target.value)} /></label>
          <label htmlFor="reps">Reps<input id="reps" type="number" min="1" max="1000" required disabled={busy} value={reps} onChange={event => setReps(event.target.value)} /></label>
        </div>
        <button className="primary" disabled={busy || !entries || !exercise.trim()}><Icon name="plus" />{busy ? 'Saving…' : 'Log lift'}</button>
      </form></section>
      <section className="card diary"><div className="section-heading"><h2>Workout log</h2>{entries && <span className="count">{entries.length}</span>}</div>
        {!entries && <p className="empty-message" role="status">{error ? 'Lifts unavailable' : 'Loading…'}</p>}
        {entries?.length === 0 && <div className="empty"><div className="empty-icon"><Icon name="lifts" /></div><h3>No lifts yet</h3><p>Log your first set.</p></div>}
        <ul className="entry-list">{entries?.map(lift => <li key={lift.id}><div className="food-name">{lift.exercise}<p className="caption">{lift.sets} × {lift.reps} · {lift.weight} {lift.unit}</p></div><button className="delete icon-button" disabled={busy} aria-label={`Delete ${lift.exercise}`} onClick={() => remove(lift.id)}><Icon name="trash" /></button></li>)}</ul>
      </section>
    </div>
  </>;
}
