// The request layer without React Native imports, so tests can drive it with a fake fetch
// (tests/api.test.mjs). api.ts creates the app's single client with the platform's base URL.
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export class RequestCancelledError extends Error { constructor() { super('Request cancelled.'); this.name = 'AbortError'; } }

export function createClient(baseURL: string, timeoutMs = 15000, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  let sessionToken: string | null = null;
  let onUnauthorized: (() => void) | undefined;
  function configureSession(token: string | null, onExpired?: () => void) { sessionToken = token; onUnauthorized = onExpired; }
  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const externalSignal = options.signal;
    const abort = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener('abort', abort, { once: true });
    // The token is captured per request: a 401 for a token that has since been replaced (sign-in,
    // sign-out) must not expire the newer session.
    const token = sessionToken;
    try {
      const headers = new Headers(options.headers);
      headers.set('Content-Type', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetchImpl(`${baseURL}/api${path}`, { ...options, headers, signal: controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (controller.signal.aborted) throw new RequestCancelledError();
        if (res.status === 401 && token && token === sessionToken && !path.startsWith('/auth/') && path !== '/account/password') onUnauthorized?.();
        throw new ApiError(body.error || 'Could not save. Please try again.', res.status);
      }
      const result = res.status === 204 ? undefined as T : await res.json();
      // A response that finishes parsing after the caller cancelled is discarded, not returned.
      if (controller.signal.aborted) throw new RequestCancelledError();
      return result;
    } catch (error) {
      // Three different situations, three messages: the caller cancelled (screens ignore this),
      // the 15-second timeout fired, or the network failed.
      if (timedOut) throw new Error('Avocado took too long to respond. Try again.');
      if (externalSignal?.aborted || error instanceof RequestCancelledError) throw new RequestCancelledError();
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) throw new Error('Cannot reach Avocado. Check your connection and try again.');
      throw error;
    } finally { clearTimeout(timer); externalSignal?.removeEventListener('abort', abort); }
  }
  return { api, configureSession };
}
