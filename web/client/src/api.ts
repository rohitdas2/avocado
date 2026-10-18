export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = RequestInit & { notifyUnauthorized?: boolean };

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

  try {
    const response = await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
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
