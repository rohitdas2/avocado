import { useEffect, useRef, useState, type FormEvent } from 'react';
import { request } from './api';
import { Icon } from './Icon';
import { emptyMacros, macroPayload, MacroInputs } from './MacroInputs';

type CustomFood = { id: string; name: string; calories: number; protein: number | null; carbs: number | null; fat: number | null };

export default function CustomFoods({ date, onAdded }: { date: string; onAdded: () => void }) {
  const [foods, setFoods] = useState<CustomFood[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [macros, setMacros] = useState(emptyMacros);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  const lifecycle = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    request<{ foods: CustomFood[] }>('/custom-foods', { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted && version === generation.current) { setFoods(result.foods); setError(''); } })
      .catch(failure => { if (!controller.signal.aborted && version === generation.current) setError(failure.message); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const refresh = () => { if (!lock.current && document.visibilityState === 'visible') setRevision(value => value + 1); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  async function perform(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; generation.current += 1; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if (!lifecycle.current?.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not save.'); }
    finally { lock.current = false; setBusy(false); }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      const food = await request<CustomFood>('/custom-foods', { method: 'POST', signal: lifecycle.current?.signal, body: JSON.stringify({ name, calories: Number(calories), ...macroPayload(macros) }) });
      setFoods(current => [...(current ?? []), food]);
      setName(''); setCalories(''); setMacros(emptyMacros); setEditing(false);
    });
  }

  function log(food: CustomFood) {
    void perform(async () => {
      // Copy per-serving nutrients into a diary snapshot. Library changes/deletion
      // must never rewrite nutrition that was already logged for a previous day.
      const { id: _id, ...values } = food;
      await request('/entries', { method: 'POST', signal: lifecycle.current?.signal, body: JSON.stringify({ ...values, date }) });
      onAdded();
    });
  }

  function remove(food: CustomFood) {
    void perform(async () => {
      await request(`/custom-foods/${food.id}`, { method: 'DELETE', signal: lifecycle.current?.signal });
      setFoods(current => current?.filter(item => item.id !== food.id) ?? []);
    });
  }

  return <section className="card custom-foods">
    <div className="section-heading"><h2>Custom foods</h2><button className="quiet" disabled={busy} onClick={() => setEditing(value => !value)}>{editing ? 'Cancel' : 'New food'}</button></div>
    {error && <p className="error" role="alert">{error}{!foods && <button className="quiet" disabled={busy} onClick={() => setRevision(value => value + 1)}>Retry</button>}</p>}
    {editing && <form onSubmit={save} className="custom-food-form">
      <p className="caption">Nutrition per serving</p>
      <label htmlFor="custom-name">Food</label><input id="custom-name" placeholder="Homemade oatmeal" maxLength={120} required value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      <label htmlFor="custom-calories">Calories <span className="muted">(kcal)</span></label><input id="custom-calories" type="number" min="0" max="100000" step="1" required value={calories} disabled={busy} onChange={event => setCalories(event.target.value)} />
      <MacroInputs prefix="custom" values={macros} disabled={busy} onChange={(macro, value) => setMacros(current => ({ ...current, [macro]: value }))} />
      <button className="primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save food'}</button>
    </form>}
    {!foods && !error && <p className="caption" role="status">Loading…</p>}
    {foods?.length === 0 && !editing && <p className="caption">Save foods you use often.</p>}
    {foods && foods.length > 0 && <ul className="entry-list custom-food-list">{foods.map(food => <li key={food.id}>
      <div className="food-name">{food.name}<p className="caption">{food.calories} kcal / serving</p><p className="caption">P {food.protein ?? '—'} · C {food.carbs ?? '—'} · F {food.fat ?? '—'} g</p></div>
      <button className="quiet" disabled={busy} aria-label={`Log ${food.name}`} onClick={() => log(food)}>Add</button>
      <button className="delete icon-button" disabled={busy} aria-label={`Delete custom food ${food.name}`} onClick={() => remove(food)}><Icon name="trash" /></button>
    </li>)}</ul>}
  </section>;
}
