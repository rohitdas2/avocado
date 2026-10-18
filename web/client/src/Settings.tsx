import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AuthScreen, useAccount } from './Account';

export type Preferences = { appearance: 'system' | 'light' | 'dark' };
export const PREFERENCES_KEY = 'avocado.preferences';

export function loadPreferences(): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (value && typeof value === 'object' && 'appearance' in value &&
      (value.appearance === 'system' || value.appearance === 'light' || value.appearance === 'dark')) {
      return { appearance: value.appearance };
    }
  } catch { /* Device preferences are optional when storage is unavailable. */ }
  return { appearance: 'system' };
}

const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function Settings({ preferences, onChange }: { preferences: Preferences; onChange: (preferences: Preferences) => void }) {
  const account = useAccount();
  const [name, setName] = useState(account.user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState<'profile' | 'password' | 'logout' | null>(null);
  const [error, setError] = useState<{ section: 'profile' | 'password' | 'logout'; text: string } | null>(null);
  const [saved, setSaved] = useState<'profile' | 'password' | null>(null);
  const pending = useRef(false);

  useEffect(() => { setName(account.user?.name ?? ''); }, [account.user?.name]);

  async function perform(section: 'profile' | 'password' | 'logout', action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(section);
    setError(null);
    setSaved(null);
    try {
      await action();
      if (section !== 'logout') setSaved(section);
    } catch (failure) {
      setError({ section, text: message(failure) });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void perform('profile', () => account.updateName(name));
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError({ section: 'password', text: 'The new passwords don’t match.' });
      setSaved(null);
      return;
    }
    void perform('password', async () => {
      await account.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    });
  }

  function appearance(value: Preferences['appearance']) {
    const next = { ...preferences, appearance: value };
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); } catch { /* Keep the choice for this session. */ }
    onChange(next);
  }

  return <div className="settings-layout">
    <section className="card" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="section-heading">Appearance</h2>
      <fieldset className="segmented appearance-options">
        <legend className="sr-only">Appearance</legend>
        {(['system', 'light', 'dark'] as const).map(value => <label key={value} className={preferences.appearance === value ? 'selected' : ''}>
          <input type="radio" name="appearance" value={value} checked={preferences.appearance === value} onChange={() => appearance(value)} />
          <span>{value[0].toUpperCase() + value.slice(1)}</span>
        </label>)}
      </fieldset>
    </section>

    {!account.user ? <AuthScreen inline /> : <>
    <section className="card" aria-labelledby="profile-title">
      <h2 id="profile-title" className="section-heading">Account</h2>
      <form onSubmit={saveName} aria-busy={busy === 'profile'}>
        <label htmlFor="profile-name">Name</label>
        <input id="profile-name" autoComplete="name" value={name} maxLength={80} required disabled={busy !== null} onChange={event => {
          setName(event.target.value);
          setSaved(null);
        }} />
        <label htmlFor="profile-email">Email</label>
        <input id="profile-email" type="email" value={account.user?.email ?? ''} readOnly autoComplete="email" />
        {error?.section === 'profile' && <p className="error" role="alert">{error.text}</p>}
        {saved === 'profile' && <p className="caption" role="status">Account saved.</p>}
        <button className="primary" disabled={busy !== null || !name.trim() || name.trim() === account.user?.name}>{busy === 'profile' ? 'Saving…' : 'Save changes'}</button>
      </form>
    </section>

    <section className="card" aria-labelledby="password-title">
      <h2 id="password-title" className="section-heading">Password</h2>
      <form onSubmit={savePassword} aria-busy={busy === 'password'}>
        <input className="sr-only" type="text" autoComplete="username" value={account.user?.email ?? ''} readOnly aria-label="Email" />
        <label htmlFor="current-password">Current password</label>
        <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} maxLength={128} required disabled={busy !== null} />
        <label htmlFor="new-password">New password</label>
        <input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={event => {
          setNewPassword(event.target.value);
          setSaved(null);
        }} minLength={12} maxLength={128} required disabled={busy !== null} aria-describedby="new-password-guidance" />
        <p id="new-password-guidance" className="caption">Use at least 12 characters.</p>
        <label htmlFor="confirm-password">Confirm new password</label>
        <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required disabled={busy !== null} />
        {error?.section === 'password' && <p className="error" role="alert">{error.text}</p>}
        {saved === 'password' && <p className="caption" role="status">Password updated.</p>}
        <button className="primary" disabled={busy !== null}>{busy === 'password' ? 'Updating…' : 'Update password'}</button>
      </form>
    </section>

    <section className="card signout-card">
      {error?.section === 'logout' && <p className="error" role="alert">{error.text}</p>}
      <button className="quiet" disabled={busy !== null} onClick={() => void perform('logout', account.signOut)}>{busy === 'logout' ? 'Signing out…' : 'Sign out'}</button>
    </section>
    </>}
  </div>;
}
