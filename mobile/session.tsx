import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, ApiError, configureSession } from './api';

type User = { id: string; name: string; email: string };
type Identity = { user: User | null; guest?: boolean };
type Session = {
  user: User | null;
  guest: boolean;
  available: boolean;
  loaded: boolean;
  restoreError: string;
  restore: () => Promise<void>;
  authenticate: (mode: 'login' | 'register', data: { name: string; email: string; password: string }) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);
const tokenKey = 'avocado.session.v1';
const guestKey = 'avocado.guest.v1';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guest, setGuest] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  async function accept(token: string, identity: Identity) {
    if (identity.guest) await SecureStore.setItemAsync(guestKey, token);
    await SecureStore.setItemAsync(tokenKey, token);
    configureSession(token, expired);
    setUser(identity.user); setGuest(Boolean(identity.guest)); setAvailable(true); setRestoreError('');
  }
  async function ensureGuest() {
    const token = await SecureStore.getItemAsync(guestKey);
    configureSession(token);
    const result = await api<Identity & { token: string }>('/auth/guest', { method: 'POST' });
    await accept(result.token, result);
  }
  function expired() {
    configureSession(null); setUser(null); setAvailable(false); setLoaded(false);
    void ensureGuest().catch(() => setRestoreError('Couldn’t open your diary. Try again.')).finally(() => setLoaded(true));
  }
  async function restoreStored() {
    try {
      const token = await SecureStore.getItemAsync(tokenKey);
      if (token) {
        configureSession(token);
        try { await accept(token, await api<Identity>('/account')); }
        catch (error) { if (error instanceof ApiError && error.status === 401) await ensureGuest(); else throw error; }
      } else await ensureGuest();
    } catch { setRestoreError('Couldn’t open your diary. Check your connection and try again.'); }
    finally { setLoaded(true); }
  }
  function restore() {
    setLoaded(false); setAvailable(false); setRestoreError('');
    return restoreStored();
  }
  useEffect(() => {
    // Restore the external SecureStore session once before mounting diary screens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restoreStored();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function authenticate(mode: 'login' | 'register', data: { name: string; email: string; password: string }) {
    const result = await api<Identity & { token: string }>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(data) });
    try { await accept(result.token, result); }
    catch {
      // Revoke an account session that could not be stored securely.
      configureSession(result.token);
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      await ensureGuest();
      throw new Error('Couldn’t save your session securely. Try again.');
    }
    // Both signup and login consume the guest diary and revoke its old token.
    await SecureStore.deleteItemAsync(guestKey).catch(() => {});
  }
  async function updateName(name: string) {
    const data = await api<{ user: User }>('/account', { method: 'PATCH', body: JSON.stringify({ name }) });
    setUser(data.user);
  }
  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    configureSession(null); setUser(null); setAvailable(false); setLoaded(false);
    try { await ensureGuest(); }
    catch { setRestoreError('Signed out. Couldn’t reopen your guest diary. Try again.'); }
    finally { setLoaded(true); }
  }
  return <SessionContext.Provider value={{ user, guest, available, loaded, restoreError, restore, authenticate, updateName, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required.');
  return session;
}
