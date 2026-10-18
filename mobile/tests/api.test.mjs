// Tests for the request layer (apiClient.ts) with a fake fetch: session races, cancellation,
// timeouts and error mapping. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, RequestCancelledError, createClient } from '../apiClient.ts';

const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// A fetch that resolves when released, and rejects like a real fetch when its signal aborts.
function controllable() {
  let release;
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    // Like real fetch: an already-aborted signal rejects at once.
    if (init.signal.aborted) { reject(new DOMException('aborted', 'AbortError')); return; }
    release = response => resolve(response);
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  return { fetchImpl, release: response => release(response) };
}

test('sends the current bearer token and JSON content type; 204 resolves to undefined', async () => {
  const seen = [];
  const { api, configureSession } = createClient('http://x', 1000, async (url, init) => { seen.push([url, init.headers.get('Authorization'), init.headers.get('Content-Type')]); return json(204); });
  configureSession('abc');
  assert.equal(await api('/workouts/1/end', { method: 'POST' }), undefined);
  assert.deepEqual(seen, [['http://x/api/workouts/1/end', 'Bearer abc', 'application/json']]);
});

test('a 401 for the current session expires it exactly once', async () => {
  let expired = 0;
  const { api, configureSession } = createClient('http://x', 1000, async () => json(401, { error: 'Sign in to continue.' }));
  configureSession('old', () => { expired += 1; });
  await assert.rejects(api('/account'), error => error instanceof ApiError && error.status === 401);
  assert.equal(expired, 1);
});

test('a late 401 for a replaced session does not sign out the new one', async () => {
  let expired = 0;
  const pending = controllable();
  const { api, configureSession } = createClient('http://x', 1000, pending.fetchImpl);
  configureSession('old', () => { expired += 1; });
  const request = api('/entries?date=2026-10-18');
  configureSession('new', () => { expired += 1; }); // user signed in while the request was in flight
  pending.release(json(401, { error: 'Sign in to continue.' }));
  await assert.rejects(request, ApiError);
  assert.equal(expired, 0);
});

test('a 401 from login or password change is a form error, not an expired session', async () => {
  let expired = 0;
  const { api, configureSession } = createClient('http://x', 1000, async () => json(401, { error: 'Email or password is incorrect.' }));
  configureSession('guest', () => { expired += 1; });
  await assert.rejects(api('/auth/login', { method: 'POST' }), /Email or password is incorrect/);
  await assert.rejects(api('/account/password', { method: 'POST' }), ApiError);
  assert.equal(expired, 0);
});

test('a caller cancellation is reported as cancelled, never as a connection problem', async () => {
  const pending = controllable();
  const { api } = createClient('http://x', 1000, pending.fetchImpl);
  const controller = new AbortController();
  const request = api('/workouts?date=2026-10-18', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, error => error instanceof RequestCancelledError && error.name === 'AbortError');
  const already = new AbortController();
  already.abort();
  await assert.rejects(api('/x', { signal: already.signal }), RequestCancelledError);
});

test('a response that arrives after cancellation is discarded', async () => {
  const controller = new AbortController();
  const { api } = createClient('http://x', 1000, async () => ({ ok: true, status: 200, json: async () => { controller.abort(); return { workouts: ['stale'] }; } }));
  await assert.rejects(api('/workouts', { signal: controller.signal }), RequestCancelledError);
});

test('timeouts and network failures have their own messages', async () => {
  const slow = controllable();
  await assert.rejects(createClient('http://x', 20, slow.fetchImpl).api('/slow'), /took too long/);
  await assert.rejects(createClient('http://x', 1000, async () => { throw new TypeError('Network request failed'); }).api('/x'), /Cannot reach Avocado/);
});

test('error bodies: server message when present, a default otherwise', async () => {
  await assert.rejects(createClient('http://x', 1000, async () => json(409, { error: 'End your current workout before starting a new one.' })).api('/workouts', { method: 'POST' }), error => error.status === 409 && /End your current workout/.test(error.message));
  await assert.rejects(createClient('http://x', 1000, async () => new Response('<html>Bad gateway</html>', { status: 502 })).api('/x'), error => error.status === 502 && error.message === 'Could not save. Please try again.');
});

test('caller listeners are removed after each request (no leak across many requests)', async () => {
  const controller = new AbortController();
  let added = 0, removed = 0;
  const signal = controller.signal;
  const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (...args) => { added += 1; return add(...args); };
  signal.removeEventListener = (...args) => { removed += 1; return remove(...args); };
  const { api } = createClient('http://x', 1000, async () => json(200, {}));
  for (let i = 0; i < 25; i += 1) await api('/x', { signal });
  assert.equal(added, 25);
  assert.equal(removed, 25);
});
