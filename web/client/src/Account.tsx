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
  sessionRevision: number;
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
  const [sessionRevision, setSessionRevision] = useState(0);
  const sessionCheck = useRef<AbortController | null>(null);
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const localMutation = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const sender = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const operationSequence = useRef(0);
  const externalOperations = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const reconcilePending = useRef(false);

  const invalidate = useCallback(() => {
    generation.current += 1;
    setSessionRevision(generation.current);
  }, []);

  // Notices contain only operation identifiers. Account details never enter BroadcastChannel or
  // localStorage (a cross-origin build keeps only its session token there, see api.ts).
  const publish = useCallback((phase: 'changing' | 'changed', operation: string) => {
    const notice = { sender: sender.current, operation, phase };
    try { channel.current?.postMessage(notice); } catch { /* Storage is the fallback. */ }
    try { localStorage.setItem('avocado.session-event', JSON.stringify(notice)); } catch { /* Focus checks still work without storage. */ }
  }, []);

  const applySession = useCallback((result: SessionResponse, changed = false) => {
    if (!result.user && !result.guest) throw new Error('Could not open your account. Please try again.');
    // Another tab may still be changing the shared cookie; wait for its final check.
    if (externalOperations.current.size) return;
    const nextIdentity = result.user ? `account:${result.user.id}` : 'guest';
    if (changed || (identity.current !== null && identity.current !== nextIdentity)) invalidate();
    identity.current = nextIdentity;
    setUser(previous => previous?.id === result.user?.id && previous?.name === result.user?.name && previous?.email === result.user?.email ? previous : result.user);
    setError('');
    setStatus(result.user ? 'authenticated' : 'guest');
  }, [invalidate]);

  const refresh = useCallback(async () => {
    sessionCheck.current?.abort();
    const controller = new AbortController();
    sessionCheck.current = controller;
    setStatus('loading'); setError('');
    try {
      let result: SessionResponse;
      try {
        result = await request<SessionResponse>('/account', { signal: controller.signal, notifyUnauthorized: false });
      } catch (failure) {
        if (controller.signal.aborted || !(failure instanceof ApiError && failure.status === 401)) throw failure;
        const operation = `${sender.current}:${++operationSequence.current}`;
        publish('changing', operation);
        try { result = await request<SessionResponse>('/auth/guest', { method: 'POST', signal: controller.signal, notifyUnauthorized: false }); }
        finally { publish('changed', operation); }
      }
      if (!controller.signal.aborted) applySession(result);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setUser(null); setError(errorMessage(failure)); setStatus('error');
    } finally {
      if (sessionCheck.current === controller) sessionCheck.current = null;
    }
  }, [applySession, publish]);

  // Normal focus/poll checks do not gate the app or change its revision when
  // identity is unchanged, so an unfinished form survives routine reconciliation.
  const checkSession = useCallback(async () => {
    if (localMutation.current || externalOperations.current.size || sessionCheck.current) return;
    const controller = new AbortController();
    sessionCheck.current = controller;
    try {
      const result = await request<SessionResponse>('/account', { signal: controller.signal, notifyUnauthorized: false });
      if (!controller.signal.aborted) applySession(result);
    } catch (failure) {
      if (!controller.signal.aborted && failure instanceof ApiError && failure.status === 401) {
        identity.current = null; invalidate(); setUser(null); setStatus('anonymous');
        setError('Your session expired. Sign in or continue as a guest.');
      }
      // A temporary connection failure leaves the current identity and drafts intact.
    } finally {
      if (sessionCheck.current === controller) sessionCheck.current = null;
    }
  }, [applySession, invalidate]);

  useEffect(() => {
    const seen = new Set<string>();
    const reconcile = () => {
      if (externalOperations.current.size) return;
      if (localMutation.current) reconcilePending.current = true;
      else void refresh();
    };
    const receive = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      const notice = value as Record<string, unknown>;
      if (typeof notice.sender !== 'string' || notice.sender === sender.current || typeof notice.operation !== 'string' || notice.operation.length > 200 || (notice.phase !== 'changing' && notice.phase !== 'changed')) return;
      const key = `${notice.operation}:${notice.phase}`;
      if (seen.has(key)) return;
      if (seen.size > 256) seen.clear();
      seen.add(key);
      sessionCheck.current?.abort(); invalidate(); setStatus('loading');
      const previous = externalOperations.current.get(notice.operation);
      if (previous) clearTimeout(previous);
      if (notice.phase === 'changing') {
        const operation = notice.operation;
        // A closed/crashed sender cannot leave every other tab gated forever.
        externalOperations.current.set(operation, setTimeout(() => { externalOperations.current.delete(operation); reconcile(); }, 20000));
      } else {
        externalOperations.current.delete(notice.operation);
        reconcile();
      }
    };
    try {
      channel.current = new BroadcastChannel('avocado-session');
      channel.current.onmessage = event => receive(event.data);
    } catch { /* Older browsers receive the same notices through storage events. */ }
    const storage = (event: StorageEvent) => {
      if (event.key !== 'avocado.session-event' || !event.newValue) return;
      try { receive(JSON.parse(event.newValue)); } catch { /* Ignore malformed external storage. */ }
    };
    const focus = () => { if (document.visibilityState === 'visible') void checkSession(); };
    const expired = () => { void checkSession(); };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    window.addEventListener('avocado:unauthorized', expired);
    const interval = window.setInterval(focus, 15000);
    void refresh();
    return () => {
      sessionCheck.current?.abort();
      channel.current?.close(); channel.current = null;
      for (const timer of externalOperations.current.values()) clearTimeout(timer);
      externalOperations.current.clear();
      clearInterval(interval);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
      window.removeEventListener('avocado:unauthorized', expired);
    };
  }, [checkSession, invalidate, refresh]);

  async function mutateSession(action: () => Promise<SessionResponse>) {
    if (localMutation.current) throw new Error('An account request is already in progress.');
    localMutation.current = true;
    sessionCheck.current?.abort();
    const operation = `${sender.current}:${++operationSequence.current}`;
    publish('changing', operation);
    try { applySession(await action(), true); }
    finally {
      localMutation.current = false;
      publish('changed', operation);
      if (reconcilePending.current && !externalOperations.current.size) {
        reconcilePending.current = false; void refresh();
      }
    }
  }

  async function continueAsGuest() {
    await mutateSession(() => request<SessionResponse>('/auth/guest', { method: 'POST', notifyUnauthorized: false }));
  }

  async function authenticate(path: string, body: object) {
    await mutateSession(() => request<SessionResponse>(path, { method: 'POST', body: JSON.stringify(body), notifyUnauthorized: false }));
  }

  async function updateName(name: string) {
    const scope = generation.current;
    const result = await request<{ user: User }>('/account', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
    if (scope === generation.current) setUser(result.user);
  }

  async function signOut() {
    await mutateSession(async () => {
      try { await request<void>('/auth/logout', { method: 'POST', notifyUnauthorized: false }); }
      catch (failure) { if (!(failure instanceof ApiError && failure.status === 401)) throw failure; }
      return request<SessionResponse>('/auth/guest', { method: 'POST', notifyUnauthorized: false });
    });
  }

  return <AccountContext.Provider value={{
    user, status, error, sessionRevision, refresh, continueAsGuest,
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

export function AuthScreen({ inline = false, initialMode = 'login' }: { inline?: boolean; initialMode?: 'login' | 'register' } = {}) {
  const account = useAccount();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
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
    {inline && <p className="caption">{creating ? 'Creating an account keeps this guest diary.' : 'Sign in to sync across devices.'}</p>}
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
