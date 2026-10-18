import { Platform } from 'react-native';
const baseURL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || (Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://127.0.0.1:3001');
let sessionToken: string | null = null;
let onUnauthorized: (() => void) | undefined;
export function configureSession(token: string | null, onExpired?: () => void) { sessionToken = token; onUnauthorized = onExpired; }
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const externalSignal = options.signal;
  const abort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abort, { once: true });
  const token = sessionToken;
  try {
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${baseURL}/api${path}`, { ...options, headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (controller.signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
      if (res.status === 401 && token && token === sessionToken && !path.startsWith('/auth/') && path !== '/account/password') onUnauthorized?.();
      throw new ApiError(body.error || 'Could not save. Please try again.', res.status);
    }
    const result = res.status === 204 ? undefined as T : await res.json();
    if (controller.signal.aborted) throw new DOMException('Request cancelled.', 'AbortError');
    return result;
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) throw new Error('Cannot reach Avocado. Check your connection and try again.');
    throw error;
  } finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', abort); }
}
