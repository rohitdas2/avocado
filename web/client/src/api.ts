export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type RequestOptions = RequestInit & { notifyUnauthorized?: boolean };

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { notifyUnauthorized = true, signal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
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
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Something went wrong. Please try again.';
      if (response.status === 401 && notifyUnauthorized) {
        window.dispatchEvent(new Event('avocado:unauthorized'));
      }
      throw new ApiError(message, response.status);
    }
    return response.status === 204 ? undefined as T : await response.json();
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
