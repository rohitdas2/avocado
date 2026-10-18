export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = RequestInit & { notifyUnauthorized?: boolean };

// Same-origin builds (Flask serves the site) use HttpOnly cookies. A build with VITE_API_URL
// (the GitHub Pages site) calls that API cross-origin with a bearer token, the transport the mobile
// app uses. Third-party cookies are blocked by browsers, so the token is kept in localStorage; it
// is the only secret stored there, and the page loads no third-party scripts.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';
const TOKEN_KEY = 'avocado.token';
export const usesBearerToken = API_URL !== '';
let memoryToken: string | null = null;
function storedToken() {
  try { return localStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
}
function storeToken(token: string) {
  memoryToken = token;
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* Without storage the session lasts until reload. */ }
}

// Browser sessions stay in HttpOnly cookies. Mutations are never retried here:
// a lost response can follow a committed write, so an automatic retry could duplicate it.
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { notifyUnauthorized = true, signal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  // Keep the timeout even when a screen supplies its own cancellation signal.
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15000);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = usesBearerToken ? storedToken() : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  try {
    const response = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers,
      credentials: usesBearerToken ? 'omit' : 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      // A canceled response can finish parsing after an identity change. It must
      // not expire the new session through the global unauthorized event.
      if (controller.signal.aborted) throw controller.signal.reason;
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Something went wrong. Please try again.';
      if (response.status === 401 && notifyUnauthorized) {
        // The account provider owns session expiry; individual screens own other errors.
        window.dispatchEvent(new Event('avocado:unauthorized'));
      }
      throw new ApiError(message, response.status);
    }
    const result = response.status === 204 ? undefined as T : await response.json();
    if (controller.signal.aborted) throw controller.signal.reason;
    // Session endpoints (guest, register, login) return the new session's token.
    if (usesBearerToken && result && typeof result === 'object' && 'token' in result && typeof result.token === 'string') storeToken(result.token);
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new Error('The request timed out. Please try again.');
    if (error instanceof TypeError) throw new Error('Could not connect. Please try again.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
