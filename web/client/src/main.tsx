import LogTime from './LogTime';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { IngredientSearch } from './Extras';
import Lifts from './Lifts';
import { Icon } from './Icon';
import Settings, { loadPreferences, type Preferences } from './Settings';
import { AccountProvider, AuthScreen, useAccount } from './Account';
import { request } from './api';
import CustomFoods from './CustomFoods';
import { emptyMacros, macroPayload, MacroInputs } from './MacroInputs';
import { dateKey } from './workoutLogic';

type Entry = { createdAt?: string; id: string; name: string; calories: number; date: string; protein?: number | null; carbs?: number | null; fat?: number | null };
type Day = { entries: Entry[]; total: number };
type Tab = 'food' | 'lifts' | 'settings' | 'login' | 'signup';

// Diary dates are local calendar days; UTC conversion can select yesterday.
const today = () => dateKey(new Date());
// Previous/next day, by calendar arithmetic so daylight-saving changes never skip a day.
function shiftDay(value: string, offset: number) {
  const [year, month, day] = value.split('-').map(Number);
  return dateKey(new Date(year, month - 1, day + offset));
}

function App() {
  const account = useAccount();
  const [tab, setTab] = useState<Tab>('food');
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<Day | null>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [quickMacros, setQuickMacros] = useState(emptyMacros);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const mutation = useRef(false);
  const activeMutation = useRef<AbortController | null>(null);
  // Invalidating a list request prevents an older response undoing a local save.
  const requestVersion = useRef(0);
  const ready = account.status === 'authenticated' || account.status === 'guest';
  const scope = `${date}:${account.status}:${account.user?.id ?? 'guest'}:${account.sessionRevision}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;

  useEffect(() => () => {
    // Cancel old response handling even if its server-side write already committed.
    activeMutation.current?.abort();
  }, [scope]);

  useEffect(() => {
    // Leaving the attribute unset lets CSS follow live OS appearance changes.
    if (!ready) return;
    if (!account.user || preferences.appearance === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = preferences.appearance;
  }, [preferences.appearance, ready, account.user]);

  useEffect(() => {
    // Only a date/account change clears drafts. Background refresh keeps them.
    setDay(null); setError(''); setName(''); setCalories(''); setQuickMacros(emptyMacros);
  }, [date, ready, account.user?.id, account.sessionRevision]);

  useEffect(() => {
    if ((account.user && (tab === 'login' || tab === 'signup')) || (!account.user && tab === 'settings')) setTab('food');
  }, [account.user, tab]);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    if (ready) request<Day>(`/entries?date=${date}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted && version === requestVersion.current) { setDay(data); setError(''); } })
      .catch(e => { if (!controller.signal.aborted && version === requestVersion.current) setError(e.message); });
    return () => controller.abort();
  }, [date, refresh, ready, account.user?.id, account.sessionRevision]);

  useEffect(() => {
    if (!ready) return;
    // A shared backend is the source of truth; visible tabs reconcile every 15s.
    const reload = () => { if (document.visibilityState === 'visible' && !mutation.current) setRefresh(value => value + 1); };
    const interval = window.setInterval(reload, 15000);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, [ready]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.current) return;
    const scopeAtStart = currentScope.current;
    const controller = new AbortController();
    activeMutation.current = controller;
    mutation.current = true; requestVersion.current += 1; setBusy(true); setError('');
    try {
      const entry = await request<Entry>('/entries', { method: 'POST', signal: controller.signal, body: JSON.stringify({ name, calories: Number(calories), ...macroPayload(quickMacros), date }) });
      // A completed save belongs to the identity/day that started it.
      if (scopeAtStart !== currentScope.current) return;
      setDay(old => old && ({ entries: [...old.entries, entry], total: old.total + entry.calories }));
      setName(''); setCalories(''); setQuickMacros(emptyMacros);
      setRefresh(value => value + 1);
    } catch (e) { if (scopeAtStart === currentScope.current) setError(e instanceof Error ? e.message : 'Unable to save.'); }
    finally { mutation.current = false; setBusy(false); }
  }

  async function remove(entry: Entry) {
    if (mutation.current) return;
    const scopeAtStart = currentScope.current;
    const controller = new AbortController();
    activeMutation.current = controller;
    mutation.current = true; requestVersion.current += 1; setBusy(true); setError('');
    try {
      await request<void>(`/entries/${entry.id}`, { method: 'DELETE', signal: controller.signal });
      if (scopeAtStart !== currentScope.current) return;
      setDay(old => old && ({ entries: old.entries.filter(e => e.id !== entry.id), total: old.total - entry.calories }));
      setRefresh(value => value + 1);
    } catch (e) { if (scopeAtStart === currentScope.current) setError(e instanceof Error ? e.message : 'Unable to delete.'); }
    finally { mutation.current = false; setBusy(false); }
  }

  const macros = (['protein', 'carbs', 'fat'] as const).map(key => ({
    key,
    value: day ? day.entries.reduce((sum, entry) => sum + (entry[key] ?? 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—',
  }));
  const partial = day?.entries.some(entry => entry.protein == null || entry.carbs == null || entry.fat == null);

  return <main>
    <header className={`app-header ${!account.user ? 'guest-header' : ''}`}>
      <a className="brand" href={import.meta.env.BASE_URL} aria-label="Avocado home"><Icon name="avocado" /><span>Avocado</span></a>
      {ready && <nav className="segmented navigation" aria-label="App sections">
        {(['food', 'lifts', ...(account.user ? ['settings' as const] : [])] as const).map(item => <button key={item} className={tab === item ? 'active' : ''} aria-pressed={tab === item} onClick={() => setTab(item)}><Icon name={item === 'settings' ? 'avocado' : item} /><span>{item === 'food' ? 'Food' : item === 'lifts' ? 'Lifts' : 'Profile'}</span></button>)}
      </nav>}
      {ready && !account.user && <div className="header-actions"><button className="quiet" onClick={() => setTab('login')}>Log in</button><button className="signup-button" onClick={() => setTab('signup')}>Sign up</button></div>}
    </header>

    {!ready ? <AuthScreen /> : tab === 'login' || tab === 'signup' ? <AuthScreen key={tab} initialMode={tab === 'signup' ? 'register' : 'login'} /> : <>
      <div className="page-heading">
        <h1>{tab === 'food' ? 'Food' : tab === 'lifts' ? 'Lifts' : account.user?.name || 'Profile'}</h1>
        {tab !== 'settings' && <div className="datebar">
          <button className="quiet day-arrow" disabled={busy} aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>‹</button>
          <input aria-label="Diary date" id="date" type="date" value={date} min="0001-01-01" max="9999-12-31" disabled={busy} onChange={e => { if (e.currentTarget.value) setDate(e.currentTarget.value); }} />
          <button className="quiet day-arrow" disabled={busy} aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}>›</button>
          <button className="quiet" disabled={busy || date === today()} onClick={() => setDate(today())}>Today</button>
        </div>}
      </div>

      {/* Account/date keys discard search and lift state when its scope changes. */}
      {tab === 'settings' && account.user ? <Settings preferences={preferences} onChange={setPreferences} /> : tab === 'lifts' ? <Lifts key={`${account.sessionRevision}:${account.user?.id ?? 'guest'}:${date}`} date={date} onDateChange={setDate} /> : <>
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
              <MacroInputs prefix="quick" values={quickMacros} disabled={busy} onChange={(macro, value) => setQuickMacros(current => ({ ...current, [macro]: value }))} />
              <button className="primary" disabled={busy || !day || !name.trim()}><Icon name="plus" />{busy ? 'Saving…' : 'Add food'}</button>
            </form></section>
            <IngredientSearch key={`search:${account.sessionRevision}:${account.user?.id ?? 'guest'}:${date}`} date={date} onAdded={() => setRefresh(n => n + 1)} />
            <CustomFoods key={`custom:${account.sessionRevision}:${account.user?.id ?? 'guest'}:${date}`} date={date} onAdded={() => setRefresh(n => n + 1)} />
          </div>

          <section className="card diary">
            <div className="section-heading"><h2>Food log</h2>{day && <span className="count">{day.entries.length}</span>}</div>
            {!day && <p className="empty-message" role="status">{error ? 'Diary unavailable' : 'Loading…'}</p>}
            {day?.entries.length === 0 && <div className="empty"><div className="empty-icon"><Icon name="food" /></div><h3>No food yet</h3><p>Add food or search ingredients.</p></div>}
            {day && day.entries.length > 0 && <ul className="entry-list timeline">{day.entries.map(entry => <li key={entry.id}>
              <LogTime value={entry.createdAt} /><span className="food-name">{entry.name}</span><strong>{entry.calories.toLocaleString()} <span className="muted">kcal</span></strong>
              <button className="delete icon-button" disabled={busy} aria-label={`Delete ${entry.name}`} onClick={() => remove(entry)}><Icon name="trash" /></button>
            </li>)}</ul>}
          </section>
        </div>
      </>}
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AccountProvider><App /></AccountProvider></React.StrictMode>);
