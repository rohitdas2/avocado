import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { IngredientSearch, Lifts } from './Extras';
import { Icon } from './Icon';
import Settings, { loadPreferences, type Preferences } from './Settings';
import { AccountProvider, AuthScreen, useAccount } from './Account';
import { request } from './api';

type Entry = { id: string; name: string; calories: number; date: string; protein?: number | null; carbs?: number | null; fat?: number | null };
type Day = { entries: Entry[]; total: number };
type Tab = 'food' | 'lifts' | 'settings';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function App() {
  const account = useAccount();
  const [tab, setTab] = useState<Tab>('food');
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<Day | null>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mutation = useRef(false);
  const ready = account.status === 'authenticated' || account.status === 'guest';

  useEffect(() => {
    if (preferences.appearance === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = preferences.appearance;
  }, [preferences.appearance]);

  useEffect(() => {
    const controller = new AbortController();
    setDay(null); setError(''); setName(''); setCalories('');
    if (ready) request<Day>(`/entries?date=${date}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDay(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [date, refresh, ready, account.user?.id]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError('');
    try {
      const entry = await request<Entry>('/entries', { method: 'POST', body: JSON.stringify({ name, calories: Number(calories), date }) });
      setDay(old => old && ({ entries: [...old.entries, entry], total: old.total + entry.calories }));
      setName(''); setCalories('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save.'); }
    finally { mutation.current = false; setBusy(false); }
  }

  async function remove(entry: Entry) {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setError('');
    try {
      await request<void>(`/entries/${entry.id}`, { method: 'DELETE' });
      setDay(old => old && ({ entries: old.entries.filter(e => e.id !== entry.id), total: old.total - entry.calories }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete.'); }
    finally { mutation.current = false; setBusy(false); }
  }

  const macros = (['protein', 'carbs', 'fat'] as const).map(key => ({
    key,
    value: day ? day.entries.reduce((sum, entry) => sum + (entry[key] ?? 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—',
  }));
  const partial = day?.entries.some(entry => entry.protein == null || entry.carbs == null || entry.fat == null);

  return <main>
    <header className="app-header">
      <a className="brand" href="/" aria-label="Avocado home"><Icon name="avocado" /><span>Avocado</span></a>
      {ready && <nav className="segmented navigation" aria-label="App sections">
        {(['food', 'lifts', 'settings'] as const).map(item => <button key={item} className={tab === item ? 'active' : ''} aria-pressed={tab === item} onClick={() => setTab(item)}><Icon name={item} /><span>{item === 'food' ? 'Food' : item === 'lifts' ? 'Lifts' : 'Settings'}</span></button>)}
      </nav>}
    </header>

    {!ready ? <AuthScreen /> : <>
      <div className="page-heading">
        <h1>{tab === 'food' ? 'Food' : tab === 'lifts' ? 'Lifts' : 'Settings'}</h1>
        {tab !== 'settings' && <div className="datebar">
          <input aria-label="Diary date" id="date" type="date" value={date} min="0001-01-01" max="9999-12-31" disabled={busy} onChange={e => { if (e.currentTarget.value) setDate(e.currentTarget.value); }} />
          <button className="quiet" disabled={busy} onClick={() => setDate(today())}>Today</button>
        </div>}
      </div>

      {tab === 'settings' ? <Settings preferences={preferences} onChange={setPreferences} /> : tab === 'lifts' ? <Lifts key={`${account.user?.id ?? 'guest'}:${date}`} date={date} /> : <>
        {error && <div className="error" role="alert">{error} {!day && <button className="quiet" onClick={() => setRefresh(n => n + 1)}>Retry</button>}</div>}
        <section className="card summary" aria-label="Daily nutrition" aria-live="polite">
          <div className="calorie-total"><h2>Calories</h2><div className="total">{day ? day.total.toLocaleString() : '—'}<span>kcal</span></div></div>
          <div className="macro-summary"><dl className="macros">{macros.map(macro => <div key={macro.key}><dt>{macro.key}</dt><dd>{macro.value}<span>g</span></dd></div>)}</dl>{partial && <p className="caption partial">Some macros unavailable.</p>}</div>
        </section>

        <div className="food-layout">
          <div className="entry-tools">
            <section className="card"><h2>Quick add</h2><form onSubmit={add}>
              <label htmlFor="food">Food</label><input id="food" placeholder="Avocado toast" value={name} maxLength={120} required disabled={busy} onChange={e => setName(e.target.value)} />
              <label htmlFor="calories">Calories <span className="muted">(kcal)</span></label><input id="calories" type="number" placeholder="320" min="0" max="100000" step="1" required value={calories} disabled={busy} onChange={e => setCalories(e.target.value)} />
              <button className="primary" disabled={busy || !day || !name.trim()}><Icon name="plus" />{busy ? 'Saving…' : 'Add food'}</button>
            </form></section>
            <IngredientSearch key={`${account.user?.id ?? 'guest'}:${date}`} date={date} onAdded={() => setRefresh(n => n + 1)} />
          </div>

          <section className="card diary">
            <div className="section-heading"><h2>Food log</h2>{day && <span className="count">{day.entries.length}</span>}</div>
            {!day && <p className="empty-message" role="status">{error ? 'Diary unavailable' : 'Loading…'}</p>}
            {day?.entries.length === 0 && <div className="empty"><div className="empty-icon"><Icon name="food" /></div><h3>No food yet</h3><p>Add food or search ingredients.</p></div>}
            {day && day.entries.length > 0 && <ul className="entry-list">{day.entries.map(entry => <li key={entry.id}>
              <span className="food-name">{entry.name}</span><strong>{entry.calories.toLocaleString()} <span className="muted">kcal</span></strong>
              <button className="delete icon-button" disabled={busy} aria-label={`Delete ${entry.name}`} onClick={() => remove(entry)}><Icon name="trash" /></button>
            </li>)}</ul>}
          </section>
        </div>
      </>}
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AccountProvider><App /></AccountProvider></React.StrictMode>);
