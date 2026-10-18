import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { request } from './api';
import NutritionFields, { emptyMacros, parseMacros, validMacros, type MacroDraft } from './NutritionFields';

type CustomFood = { id: string; name: string; calories: number; protein: number | null; carbs: number | null; fat: number | null };

// Mirrors mobile/CustomFoods.tsx: saved per-serving foods. Log copies the values into a diary
// entry (a snapshot, so editing or deleting the saved food never rewrites past days).
export default function CustomFoods({ date, onLogged }: { date: string; onLogged: () => void }) {
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
  const lifecycle = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (lock.current) return;
    const request_ = ++version.current;
    request<{ foods: CustomFood[] }>('/custom-foods', { signal: lifecycle.current?.signal })
      .then(result => { if (!lifecycle.current?.signal.aborted && request_ === version.current) setFoods(result.foods); })
      .catch(e => { if (!lifecycle.current?.signal.aborted && request_ === version.current) setError(e.message); });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    refresh();
    // Foreground refresh, as on mobile: focus, becoming visible, and every 15 s while visible.
    const reload = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setInterval(reload, 15000);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => { controller.abort(); version.current += 1; window.clearInterval(timer); window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, [refresh]);

  async function perform(action: (signal?: AbortSignal) => Promise<void>, message: string) {
    if (lock.current) return;
    lock.current = true; version.current += 1; setBusy(true); setError(''); setStatus('');
    try { await action(lifecycle.current?.signal); if (!lifecycle.current?.signal.aborted) setStatus(message); }
    catch (e) { if (!lifecycle.current?.signal.aborted) setError((e as Error).message); }
    finally { lock.current = false; if (!lifecycle.current?.signal.aborted) setBusy(false); }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !/^\d+$/.test(calories) || Number(calories) > 100000 || !validMacros(macros)) { setError('Enter a name, whole-number calories, and optional macros from 0–100,000 g.'); return; }
    void perform(async signal => {
      const food = await request<CustomFood>('/custom-foods', { method: 'POST', signal, body: JSON.stringify({ name: name.trim(), calories: Number(calories), ...parseMacros(macros) }) });
      setFoods(old => [...(old || []), food]); setCreating(false); setName(''); setCalories(''); setMacros(emptyMacros);
    }, 'Food saved.');
  }

  function log(food: CustomFood) {
    void perform(async signal => {
      await request('/entries', { method: 'POST', signal, body: JSON.stringify({ name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, date }) });
      onLogged();
    }, `${food.name} added.`);
  }

  function remove(food: CustomFood) {
    void perform(async signal => {
      await request(`/custom-foods/${food.id}`, { method: 'DELETE', signal });
      setFoods(old => old?.filter(value => value.id !== food.id) || []);
    }, 'Food removed from your saved foods.');
  }

  return <section className="card custom-foods">
    <div className="section-heading"><h2>Custom foods</h2><button className="quiet" disabled={busy} onClick={() => { setCreating(!creating); setError(''); setStatus(''); }}>{creating ? 'Cancel' : 'New food'}</button></div>
    {creating && <form onSubmit={save} className="custom-food-form" noValidate>
      <p className="caption">Nutrition per serving</p>
      <label htmlFor="custom-name">Name</label><input id="custom-name" aria-label="Custom food name" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      <label htmlFor="custom-calories">Calories (kcal)</label><input id="custom-calories" aria-label="Custom food calories per serving" inputMode="numeric" maxLength={6} placeholder="320" value={calories} disabled={busy} onChange={event => setCalories(event.target.value)} />
      <NutritionFields prefix="custom" values={macros} onChange={setMacros} disabled={busy} />
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save food'}</button>
    </form>}
    {!foods && !error && <p className="caption" role="status">Loading…</p>}
    {foods?.length === 0 && !creating && <p className="caption">No custom foods yet.</p>}
    {foods && foods.length > 0 && <ul className="entry-list custom-food-list">{foods.map(food => <li key={food.id}>
      <div className="food-name">{food.name}<p className="caption">{food.calories.toLocaleString()} kcal · 1 serving</p><p className="caption">P {food.protein ?? '—'} · C {food.carbs ?? '—'} · F {food.fat ?? '—'} g</p></div>
      <button className="quiet" disabled={busy} aria-label={`Log one serving of ${food.name}`} onClick={() => log(food)}>Log</button>
      <button className="quiet danger-text" disabled={busy} aria-label={`Delete custom food ${food.name}`} onClick={() => remove(food)}>Delete</button>
    </li>)}</ul>}
    {error && <div><p className="error" role="alert">{error}</p>{!foods && <button className="quiet" onClick={refresh}>Retry</button>}</div>}
    {status && <p className="caption" role="status">{status}</p>}
  </section>;
}
