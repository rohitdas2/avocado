import LogTime from './LogTime';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { request } from './api';
import IngredientSearch from './IngredientSearch';
import CustomFoods from './CustomFoods';
import NutritionFields, { emptyMacros, parseMacros, validMacros, type MacroDraft } from './NutritionFields';

// The Food screen, mirroring mobile's Diary (mobile/App.tsx) on the same API: daily totals, one
// Add food card with Search (USDA) and Quick add modes, Custom foods, then the day's Entries.
// main.tsx keys this component by day and identity, so a date or account change starts fresh.
type Entry = { createdAt?: string; id: string; name: string; calories: number; date: string; protein?: number | null; carbs?: number | null; fat?: number | null };
type Day = { entries: Entry[]; total: number };

export default function Food({ date }: { date: string }) {
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
  const lifecycle = useRef<AbortController | null>(null);
  function reload() { setError(''); setLoadError(''); setRevision(n => n + 1); }

  const refresh = useCallback(() => {
    if (locked.current) return;
    const version = ++requestVersion.current;
    request<Day>(`/entries?date=${date}`, { signal: lifecycle.current?.signal })
      .then(result => { if (version === requestVersion.current && !locked.current) { setDay(result); setLoadError(''); } })
      .catch(e => { if (!lifecycle.current?.signal.aborted && version === requestVersion.current && !locked.current) setLoadError(e.message); });
  }, [date]);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => { refresh(); return () => { requestVersion.current += 1; }; }, [refresh, revision]);
  useEffect(() => {
    // Foreground refresh, as on mobile: focus, becoming visible, and every 15 s while visible.
    const foreground = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = window.setInterval(foreground, 15000);
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', foreground); document.removeEventListener('visibilitychange', foreground); };
  }, [refresh]);

  async function mutate(entry?: Entry) {
    if (locked.current) return;
    if (!entry && (!name.trim() || !/^\d+$/.test(calories) || Number(calories) > 100000 || !validMacros(macroDraft))) {
      setError('Enter a name, whole-number calories, and optional macros from 0–100,000 g.'); return;
    }
    locked.current = true; requestVersion.current += 1; setBusy(true); setError('');
    const signal = lifecycle.current?.signal;
    try {
      if (entry) {
        await request<void>(`/entries/${entry.id}`, { method: 'DELETE', signal });
        setDay(old => old && ({ entries: old.entries.filter(e => e.id !== entry.id), total: old.total - entry.calories }));
      } else {
        const added = await request<Entry>('/entries', { method: 'POST', signal, body: JSON.stringify({ name, calories: Number(calories), date, ...parseMacros(macroDraft) }) });
        setDay(old => old && ({ entries: [...old.entries, added], total: old.total + added.calories }));
        setName(''); setCalories(''); setMacroDraft(emptyMacros);
      }
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { locked.current = false; if (!signal?.aborted) setBusy(false); }
  }

  function addQuick(event: FormEvent) { event.preventDefault(); void mutate(); }

  const partialMacros = day?.entries.some(entry => entry.protein == null || entry.carbs == null || entry.fat == null);
  function macroTotal(macro: 'protein' | 'carbs' | 'fat') {
    if (!day || (day.entries.length > 0 && day.entries.every(entry => entry[macro] == null))) return '—';
    return `${day.entries.reduce((sum, entry) => sum + (entry[macro] ?? 0), 0).toFixed(1)} g`;
  }

  return <>
    {(error || loadError) && <div className="error error-card" role="alert">{error || loadError}<button className="quiet" disabled={busy} onClick={reload}>Retry</button></div>}
    <section className="card summary" aria-label="Daily nutrition" aria-live="polite">
      <div className="calorie-total"><h2>Calories</h2><div className="total">{day ? day.total.toLocaleString() : '—'}<span>kcal</span></div>
        {!day && <p className="caption">{error || loadError ? 'Diary unavailable' : 'Loading…'}</p>}</div>
      <div className="macro-summary"><dl className="macros">{(['protein', 'carbs', 'fat'] as const).map(macro => <div key={macro}><dt>{macro}</dt><dd>{macroTotal(macro)}</dd></div>)}</dl>
        {partialMacros && <p className="caption partial">Macro totals are incomplete.</p>}</div>
    </section>

    <div className="food-columns">
      <div className="food-tools">
        <section className="card add-food">
          <div className="section-heading"><h2>Add food</h2>{mode === 'search' && <span className="caption">USDA</span>}</div>
          <div className="segmented modes" role="tablist">{([['search', 'Search'], ['quick', 'Quick add']] as const).map(([value, label]) =>
            <button key={value} role="tab" aria-selected={mode === value} className={mode === value ? 'active' : ''} disabled={busy} onClick={() => { setMode(value); setError(''); }}>{label}</button>)}</div>
          {mode === 'search' ? <IngredientSearch date={date} onAdded={reload} /> : <form onSubmit={addQuick} noValidate>
            <label htmlFor="quick-name">Name</label><input id="quick-name" aria-label="Food name" placeholder="Avocado toast" maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
            <label htmlFor="quick-calories">Calories (kcal)</label><input id="quick-calories" aria-label="Calories" inputMode="numeric" placeholder="320" maxLength={6} value={calories} disabled={busy} onChange={event => setCalories(event.target.value)} />
            <NutritionFields prefix="quick" values={macroDraft} onChange={setMacroDraft} disabled={busy} />
            <button className="primary" disabled={busy || !day}>{busy ? 'Saving…' : 'Add food'}</button>
          </form>}
        </section>
        <CustomFoods date={date} onLogged={reload} />
      </div>

      <section className="card diary entries">
        <div className="section-heading"><h2>Entries</h2><button className="quiet" disabled={busy} onClick={reload}>Refresh</button></div>
        {day?.entries.length === 0 && <p className="caption empty-line">No food logged.</p>}
        {day && day.entries.length > 0 && <ul className="entry-list timeline">{day.entries.map(entry => <li key={entry.id}>
          <LogTime value={entry.createdAt} />
          <div className="food-name">{entry.name}<p className="caption">{entry.calories.toLocaleString()} kcal</p></div>
          <button className="quiet danger-text" disabled={busy} aria-label={`Delete ${entry.name}`} onClick={() => void mutate(entry)}>Delete</button>
        </li>)}</ul>}
      </section>
    </div>
  </>;
}
