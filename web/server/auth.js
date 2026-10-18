import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const DUMMY_PASSWORD = `sha512$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export const SESSION_COOKIE = 'avocado_session';
export const GUEST_COOKIE = 'avocado_guest';
export const SESSION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const publicAccount = account => ({ id: account.id, name: account.name, email: account.email });
export const normalizeEmail = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
export const validEmail = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validName = name => typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 80;
export const validPassword = password => typeof password === 'string' && password.length >= 12 && password.length <= 128;

export async function hashPassword(password) {
  const salt = randomUUID().replaceAll('-', '');
  const digest = createHash('sha512').update(salt + password, 'utf8').digest('hex');
  return { password: `sha512$${salt}$${digest}` };
}

export async function verifyPassword(password, account) {
  const encoded = account?.password ?? DUMMY_PASSWORD;
  if (!/^sha512\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded)) return false;
  const [, salt, digest] = encoded.split('$');
  const expected = Buffer.from(digest, 'hex');
  const actual = createHash('sha512').update(salt + password, 'utf8').digest();
  return expected.length === actual.length && timingSafeEqual(actual, expected) && Boolean(account);
}

export const newToken = () => randomBytes(32).toString('hex');
export const tokenDigest = token => createHash('sha256').update(token).digest('hex');

export function cookieToken(req, name) {
  const cookie = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  const token = cookie?.slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(token ?? '') ? token : null;
}
export function requestToken(req) {
  if (req.headers.authorization) return /^Bearer ([a-f0-9]{64})$/i.exec(req.headers.authorization)?.[1] ?? null;
  return cookieToken(req, SESSION_COOKIE) ?? cookieToken(req, GUEST_COOKIE);
}

export function credentialLimiter({ limit = 20, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const clients = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [key, record] of clients) if (record.resetAt <= time) clients.delete(key);
    const key = req.ip;
    const record = clients.get(key) ?? { count: 0, resetAt: time + windowMs };
    // Bound memory if many source addresses arrive within one window.
    if (!clients.has(key) && clients.size >= 10000) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    clients.set(key, record);
    if (++record.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((record.resetAt - time) / 1000))));
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    next();
  };
}
