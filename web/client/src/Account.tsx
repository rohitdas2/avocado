import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ApiError, request } from './api';

export type User = { id: string; name: string; email: string };
type AccountStatus = 'loading' | 'authenticated' | 'guest' | 'anonymous' | 'error';
type SessionResponse = { user: User | null; guest?: boolean };
type Account = {
  user: User | null;
  status: AccountStatus;
  error: string;
  refresh: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<Account | null>(null);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [error, setError] = useState('');
  const sessionCheck = useRef<AbortController | null>(null);

  const applySession = useCallback((result: SessionResponse) => {
    if (!result.user && !result.guest) throw new Error('Could not open your account. Please try again.');
    setUser(result.user);
    setError('');
    setStatus(result.user ? 'authenticated' : 'guest');
  }, []);

  const refresh = useCallback(async () => {
    sessionCheck.current?.abort();
    const controller = new AbortController();
    sessionCheck.current = controller;
    setStatus('loading');
    setError('');
    try {
      let result: SessionResponse;
      try {
        result = await request<SessionResponse>('/account', { signal: controller.signal, notifyUnauthorized: false });
      } catch (failure) {
        if (controller.signal.aborted || !(failure instanceof ApiError && failure.status === 401)) throw failure;
        result = await request<SessionResponse>('/auth/guest', {
          method: 'POST', signal: controller.signal, notifyUnauthorized: false,
        });
      }
      if (!controller.signal.aborted) applySession(result);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setUser(null);
      setError(errorMessage(failure));
      setStatus('error');
    } finally {
      if (sessionCheck.current === controller) sessionCheck.current = null;
    }
  }, [applySession]);

  const continueAsGuest = useCallback(async () => {
    sessionCheck.current?.abort();
    setError('');
    setStatus('loading');
    try {
      applySession(await request<SessionResponse>('/auth/guest', { method: 'POST', notifyUnauthorized: false }));
    } catch (failure) {
      setUser(null);
      setError(errorMessage(failure));
      setStatus('error');
      throw failure;
    }
  }, [applySession]);

  useEffect(() => {
    const expired = () => {
      sessionCheck.current?.abort();
      setUser(null);
      setStatus('anonymous');
      setError('Your session expired. Sign in or continue as a guest.');
    };
    window.addEventListener('avocado:unauthorized', expired);
    void refresh();
    return () => {
      sessionCheck.current?.abort();
      window.removeEventListener('avocado:unauthorized', expired);
    };
  }, [refresh]);

  async function authenticate(path: string, body: object) {
    sessionCheck.current?.abort();
    const result = await request<SessionResponse>(path, {
      method: 'POST', body: JSON.stringify(body), notifyUnauthorized: false,
    });
    applySession(result);
  }

  async function updateName(name: string) {
    const result = await request<{ user: User }>('/account', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
    setUser(result.user);
  }

  async function signOut() {
    try {
      await request<void>('/auth/logout', { method: 'POST', notifyUnauthorized: false });
    } catch (failure) {
      if (!(failure instanceof ApiError && failure.status === 401)) throw failure;
    }
    await continueAsGuest();
  }

  return <AccountContext.Provider value={{
    user, status, error, refresh, continueAsGuest,
    signIn: (email, password) => authenticate('/auth/login', { email: email.trim(), password }),
    register: (name, email, password) => authenticate('/auth/register', { name: name.trim(), email: email.trim(), password }),
    updateName,
    changePassword: (currentPassword, newPassword) => request<void>('/account/password', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword }), notifyUnauthorized: false,
    }),
    signOut,
  }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error('useAccount must be used within AccountProvider.');
  return account;
}

export function AuthScreen({ inline = false }: { inline?: boolean } = {}) {
  const account = useAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const pending = useRef(false);
  const creating = mode === 'register';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (creating) await account.register(name, email, password);
      else await account.signIn(email, password);
      setPassword('');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (account.status === 'loading') return <section className="card auth-card account-state" role="status">Opening your diary…</section>;
  if (account.status === 'error') return <section className="card auth-card account-state">
    <h1>Account unavailable</h1>
    <p className="error" role="alert">{account.error}</p>
    <button className="primary" onClick={() => void account.refresh()}>Try again</button>
  </section>;

  return <section className={inline ? 'card auth-inline' : 'card auth-card'} aria-labelledby="auth-title">
    {inline ? <h2 id="auth-title" className="section-heading">{creating ? 'Create an account' : 'Sign in'}</h2> : <h1 id="auth-title">{creating ? 'Create your account' : 'Sign in to Avocado'}</h1>}
    <form onSubmit={submit} aria-busy={busy}>
      {creating && <>
        <label htmlFor="account-name">Name</label>
        <input id="account-name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy || guestBusy} />
      </>}
      <label htmlFor="account-email">Email</label>
      <input id="account-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required disabled={busy || guestBusy} />
      <label htmlFor="account-password">Password</label>
      <input id="account-password" type="password" autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} minLength={creating ? 12 : undefined} maxLength={128} required disabled={busy || guestBusy} aria-describedby={creating ? 'password-guidance' : undefined} />
      {creating && <p id="password-guidance" className="caption">Use at least 12 characters.</p>}
      {(error || account.error) && <p className="error" role="alert">{error || account.error}</p>}
      <button className="primary" disabled={busy || guestBusy || (creating && !name.trim())}>{busy ? (creating ? 'Creating account…' : 'Signing in…') : (creating ? 'Create account' : 'Sign in')}</button>
    </form>
    <button className="quiet auth-switch" disabled={busy || guestBusy} onClick={() => {
      setMode(creating ? 'login' : 'register');
      setError('');
      setPassword('');
    }}>{creating ? 'Already have an account? Sign in' : 'Create an account'}</button>
    {account.status !== 'guest' && <button className="quiet auth-switch" disabled={busy || guestBusy} onClick={() => {
      if (pending.current) return;
      pending.current = true;
      setGuestBusy(true);
      void account.continueAsGuest().catch(failure => setError(errorMessage(failure))).finally(() => {
        pending.current = false;
        setGuestBusy(false);
      });
    }}>{guestBusy ? 'Opening diary…' : 'Continue as a guest'}</button>}
  </section>;
}
