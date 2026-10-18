import { createApp } from './app.js';
import { createPool, repository } from './db.js';
const pool = createPool();
await pool.query('SELECT 1 FROM food_entries LIMIT 1');
await pool.query('SELECT 1 FROM accounts LIMIT 1');
await pool.query('SELECT 1 FROM account_sessions LIMIT 1');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3001);
const server = createApp(repository(pool)).listen(port, host, () => console.log(`Avocado is running at http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
