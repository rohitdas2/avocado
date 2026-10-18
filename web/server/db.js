import pg from 'pg';
import { readFile } from 'node:fs/promises';
export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required. Copy .env.example to .env first.');
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  pool.on('error', error => console.error('Database connection error:', error.message));
  return pool;
}
export async function migrate(pool) {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}
export function repository(pool) {
  const columns = "id, name, calories, protein, carbs, fat, to_char(entry_date, 'YYYY-MM-DD') AS date";
  const accountColumns = 'id, name, email, is_guest AS "isGuest"';
  return {
    async createAccount(account) {
      try {
        return (await pool.query(`INSERT INTO accounts (id, name, email, password, is_guest) VALUES ($1, $2, $3, $4, $5) RETURNING ${accountColumns}`, [account.id, account.name, account.email, account.password, account.isGuest ?? false])).rows[0];
      } catch (error) {
        if (error.code === '23505') return null;
        throw error;
      }
    },
    async upgradeGuest(id, account) {
      try {
        return (await pool.query(`WITH updated AS (
          UPDATE accounts SET name = $2, email = $3, password = $4, is_guest = false WHERE id = $1 AND is_guest = true RETURNING ${accountColumns}
        ), revoked AS (
          DELETE FROM account_sessions WHERE account_id IN (SELECT id FROM updated)
        ) SELECT * FROM updated`, [id, account.name, account.email, account.password])).rows[0];
      } catch (error) {
        if (error.code === '23505') return null;
        throw error;
      }
    },
    async accountByEmail(email) {
      return (await pool.query(`SELECT ${accountColumns}, password FROM accounts WHERE email = $1`, [email])).rows[0];
    },
    async accountById(id) {
      return (await pool.query(`SELECT ${accountColumns}, password FROM accounts WHERE id = $1`, [id])).rows[0];
    },
    async updateAccount(id, name) {
      return (await pool.query(`UPDATE accounts SET name = $2 WHERE id = $1 RETURNING ${accountColumns}`, [id, name])).rows[0];
    },
    async createSession(session) {
      await pool.query('INSERT INTO account_sessions (token_digest, account_id, expires_at) VALUES ($1, $2, $3)', [session.tokenDigest, session.accountId, session.expiresAt]);
      // Sessions are absolute, with periodic cleanup during successful sign-in.
      await pool.query('DELETE FROM account_sessions WHERE expires_at <= now()');
    },
    async sessionAccount(digest) {
      return (await pool.query('SELECT a.id, a.name, a.email, a.is_guest AS "isGuest" FROM accounts a JOIN account_sessions s ON s.account_id = a.id WHERE s.token_digest = $1 AND s.expires_at > now()', [digest])).rows[0];
    },
    async removeSession(digest) { await pool.query('DELETE FROM account_sessions WHERE token_digest = $1', [digest]); },
    async changePassword(id, previousPassword, password, currentSession) {
      // A single statement keeps the update and other-session revocation atomic.
      // Checking the old digest also prevents concurrent changes using a stale password.
      return (await pool.query(`WITH updated AS (
        UPDATE accounts SET password = $3 WHERE id = $1 AND password = $2 RETURNING id
      ), revoked AS (
        DELETE FROM account_sessions WHERE account_id IN (SELECT id FROM updated) AND token_digest <> $4
      ) SELECT id FROM updated`, [id, previousPassword, password.password, currentSession])).rowCount > 0;
    },
    async list(date, accountId) {
      return (await pool.query(`SELECT ${columns} FROM food_entries WHERE entry_date = $1 AND account_id = $2 ORDER BY created_at, id`, [date, accountId])).rows;
    },
    async add(entry, accountId) {
      return (await pool.query(`INSERT INTO food_entries (id, name, calories, entry_date, protein, carbs, fat, account_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${columns}`, [entry.id, entry.name, entry.calories, entry.date, entry.protein ?? null, entry.carbs ?? null, entry.fat ?? null, accountId])).rows[0];
    },
    async remove(id, accountId) { return (await pool.query('DELETE FROM food_entries WHERE id = $1 AND account_id = $2', [id, accountId])).rowCount > 0; },
    async listLifts(date, accountId) { return (await pool.query("SELECT id, exercise, weight, unit, sets, reps, to_char(entry_date, 'YYYY-MM-DD') AS date FROM lift_entries WHERE entry_date=$1 AND account_id=$2 ORDER BY created_at, id", [date, accountId])).rows; },
    async addLift(e, accountId) { return (await pool.query("INSERT INTO lift_entries (id,exercise,weight,unit,sets,reps,entry_date,account_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,exercise,weight,unit,sets,reps,to_char(entry_date, 'YYYY-MM-DD') AS date", [e.id,e.exercise,e.weight,e.unit,e.sets,e.reps,e.date,accountId])).rows[0]; },
    async removeLift(id, accountId) { return (await pool.query('DELETE FROM lift_entries WHERE id=$1 AND account_id=$2',[id,accountId])).rowCount > 0; },
    async health() { await pool.query('SELECT 1'); }
  };
}
