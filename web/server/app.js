import express from 'express';
import { searchFoods } from './nutrition.js';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validDate, validEntry, validId, validLift } from './validation.js';
import { cookieToken, credentialLimiter, GUEST_COOKIE, hashPassword, newToken, normalizeEmail, publicAccount, requestToken, SESSION_AGE_MS, SESSION_COOKIE, tokenDigest, validEmail, validName, validPassword, verifyPassword } from './auth.js';
export function createApp(store, nutritionSearch = searchFoods, options = {}) {
  const app = express();
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: options.secureCookies ?? process.env.NODE_ENV === 'production', path: '/' };
  const limitCredentials = credentialLimiter(options.rateLimit);
  const accountResponse = account => account.isGuest ? { user: null, guest: true } : { user: publicAccount(account) };
  async function existingGuest(req) {
    const token = req.headers.authorization ? requestToken(req) : cookieToken(req, GUEST_COOKIE);
    const account = token ? await store.sessionAccount(tokenDigest(token)) : null;
    return account?.isGuest ? { account, token } : null;
  }
  async function startSession(account, res, status = 200) {
    const token = newToken();
    await store.createSession({ tokenDigest: tokenDigest(token), accountId: account.id, expiresAt: new Date(Date.now() + SESSION_AGE_MS) });
    res.cookie(account.isGuest ? GUEST_COOKIE : SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_AGE_MS });
    res.status(status).json({ ...accountResponse(account), token });
  }
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.headers.authorization) return next();
    // Cookie-authenticated browser writes must originate from this app.
    let foreignOrigin = false;
    if (req.headers.origin) {
      try { foreignOrigin = new URL(req.headers.origin).host !== req.get('host'); }
      catch { foreignOrigin = true; }
    }
    if (foreignOrigin || req.get('Sec-Fetch-Site') === 'cross-site') return res.status(403).json({ error: 'This request must come from Avocado.' });
    next();
  });
  app.get('/api/health', async (_req, res) => { await store.health(); res.json({ status: 'ok' }); });
  app.post('/api/auth/guest', limitCredentials, async (req, res) => {
    const guest = await existingGuest(req);
    if (guest) return res.json({ ...accountResponse(guest.account), token: guest.token });
    const account = await store.createAccount({ id: randomUUID(), name: 'Guest', email: null, password: null, isGuest: true });
    await startSession(account, res, 201);
  });
  app.post('/api/auth/register', limitCredentials, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!validName(req.body?.name) || !validEmail(email) || !validPassword(req.body?.password)) return res.status(400).json({ error: 'Enter a name (1–80 characters), valid email, and password (12–128 characters).' });
    const guest = await existingGuest(req);
    const details = { name: req.body.name.trim(), email, ...await hashPassword(req.body.password) };
    const account = guest ? await store.upgradeGuest(guest.account.id, details) : await store.createAccount({ id: randomUUID(), ...details });
    if (!account) return res.status(409).json({ error: 'An account with that email already exists.' });
    res.clearCookie(GUEST_COOKIE, cookieOptions);
    await startSession(account, res, 201);
  });
  app.post('/api/auth/login', limitCredentials, async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!validEmail(email) || !validPassword(req.body?.password)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const account = await store.accountByEmail(email);
    if (!await verifyPassword(req.body.password, account)) return res.status(401).json({ error: 'Email or password is incorrect.' });
    await startSession(account, res);
  });
  app.use('/api', async (req, res, next) => {
    const token = requestToken(req);
    const digest = token ? tokenDigest(token) : null;
    const account = digest ? await store.sessionAccount(digest) : null;
    if (!account) return res.status(401).json({ error: 'Sign in to continue.' });
    req.account = account;
    req.sessionDigest = digest;
    next();
  });
  app.get('/api/account', (req, res) => res.json(accountResponse(req.account)));
  app.patch('/api/account', async (req, res) => {
    if (req.account.isGuest) return res.status(403).json({ error: 'Create an account to update your profile.' });
    if (!validName(req.body?.name)) return res.status(400).json({ error: 'Enter a name using 1–80 characters.' });
    const account = await store.updateAccount(req.account.id, req.body.name.trim());
    if (!account) return res.status(401).json({ error: 'Sign in to continue.' });
    res.json({ user: publicAccount(account) });
  });
  app.post('/api/account/password', limitCredentials, async (req, res) => {
    if (req.account.isGuest) return res.status(403).json({ error: 'Create an account to set a password.' });
    if (!validPassword(req.body?.currentPassword) || !validPassword(req.body?.newPassword)) return res.status(400).json({ error: 'Passwords must use 12–128 characters.' });
    const account = await store.accountById(req.account.id);
    if (!await verifyPassword(req.body.currentPassword, account)) return res.status(401).json({ error: 'Current password is incorrect.' });
    const changed = await store.changePassword(account.id, account.password, await hashPassword(req.body.newPassword), req.sessionDigest);
    if (!changed) return res.status(409).json({ error: 'Your password changed elsewhere. Sign in and try again.' });
    res.status(204).end();
  });
  app.post('/api/auth/logout', async (req, res) => {
    await store.removeSession(req.sessionDigest);
    res.clearCookie(req.account.isGuest ? GUEST_COOKIE : SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  });
  app.get('/api/entries', async (req, res) => {
    if (!validDate(req.query.date)) return res.status(400).json({ error: 'Choose a valid date (YYYY-MM-DD).' });
    const entries = await store.list(req.query.date, req.account.id);
    res.json({ entries, total: entries.reduce((sum, entry) => sum + entry.calories, 0) });
  });
  app.post('/api/entries', async (req, res) => {
    if (!validEntry(req.body)) return res.status(400).json({ error: 'Enter a food name (1–120 characters), whole-number calories (0–100,000), and a valid date.' });
    const entry = await store.add({ id: randomUUID(), name: req.body.name.trim(), calories: req.body.calories, date: req.body.date, protein: req.body.protein, carbs: req.body.carbs, fat: req.body.fat }, req.account.id);
    res.status(201).json(entry);
  });
  app.delete('/api/entries/:id', async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid entry ID.' });
    if (!await store.remove(req.params.id, req.account.id)) return res.status(404).json({ error: 'Entry not found.' });
    res.status(204).end();
  });
  app.get('/api/foods/search', async (req, res) => {
    if (typeof req.query.q !== 'string' || req.query.q.trim().length < 2 || req.query.q.length > 100) return res.status(400).json({error:'Search for an ingredient using 2–100 characters.'});
    try { res.json({foods: await nutritionSearch(req.query.q.trim()), source: 'USDA FoodData Central', basis: 'per 100 g'}); }
    catch (error) { res.status(502).json({error: error.name === 'TimeoutError' ? 'Nutrition search timed out. Try again.' : error.message}); }
  });
  app.get('/api/lifts', async (req,res) => {
    if (!validDate(req.query.date)) return res.status(400).json({error:'Choose a valid date.'});
    res.json({entries: await store.listLifts(req.query.date, req.account.id)});
  });
  app.post('/api/lifts', async (req,res) => {
    if (!validLift(req.body)) return res.status(400).json({error:'Enter an exercise, weight (0–10,000), unit, sets (1–100), reps (1–1,000), and a valid date.'});
    res.status(201).json(await store.addLift({...req.body,exercise:req.body.exercise.trim(),id:randomUUID()}, req.account.id));
  });
  app.delete('/api/lifts/:id', async (req,res) => {
    if (!validId(req.params.id)) return res.status(400).json({error:'Invalid lift ID.'});
    if (!await store.removeLift(req.params.id, req.account.id)) return res.status(404).json({error:'Lift not found.'});
    res.status(204).end();
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    console.error('Request failed:', err.message);
    res.status(503).json({ error: 'Unable to reach the database. Please try again.' });
  });
  return app;
}
