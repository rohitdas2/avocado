import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import Food from './Food';
import Lifts from './Lifts';
import { Icon } from './Icon';
import Settings, { loadPreferences, type Preferences } from './Settings';
import { AccountProvider, AuthScreen, useAccount } from './Account';
import { dateKey } from './workoutLogic';

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
  const ready = account.status === 'authenticated' || account.status === 'guest';
  // Each screen is keyed by day and identity, so a change discards its drafts and in-flight replies.
  const scope = `${account.sessionRevision}:${account.user?.id ?? 'guest'}:${date}`;

  useEffect(() => {
    // Leaving the attribute unset lets CSS follow live OS appearance changes.
    if (!ready) return;
    if (!account.user || preferences.appearance === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = preferences.appearance;
  }, [preferences.appearance, ready, account.user]);

  useEffect(() => {
    if ((account.user && (tab === 'login' || tab === 'signup')) || (!account.user && tab === 'settings')) setTab('food');
  }, [account.user, tab]);

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
          <button className="quiet day-arrow" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}>‹</button>
          <input aria-label="Diary date" id="date" type="date" value={date} min="0001-01-01" max="9999-12-31" onChange={e => { if (e.currentTarget.value) setDate(e.currentTarget.value); }} />
          <button className="quiet day-arrow" aria-label="Next day" onClick={() => setDate(shiftDay(date, 1))}>›</button>
          <button className="quiet" disabled={date === today()} onClick={() => setDate(today())}>Today</button>
        </div>}
      </div>

      {tab === 'settings' && account.user ? <Settings preferences={preferences} onChange={setPreferences} /> : tab === 'lifts' ? <Lifts key={scope} date={date} onDateChange={setDate} /> : <Food key={scope} date={date} />}
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AccountProvider><App /></AccountProvider></React.StrictMode>);
