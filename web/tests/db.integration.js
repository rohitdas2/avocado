import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createPool, migrate, repository } from '../server/db.js';
import { createApp } from '../server/app.js';
// An isolated schema avoids touching the user's food entries.
test('real PostgreSQL: migration, persistence, date isolation, constraints, delete', async () => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a PostgreSQL database with CREATE SCHEMA permission.');
  const pool = createPool(process.env.TEST_DATABASE_URL);
  const client = await pool.connect();
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await migrate(client); await migrate(client);
    const api = request(createApp(repository(client)));
    await api.get('/api/health').expect(200);
    const entry = (await api.post('/api/entries').send({name:"Soup'); DROP TABLE food_entries; --",calories:250,date:'2024-02-29',protein:10,carbs:20,fat:5}).expect(201)).body;
    await api.post('/api/entries').send({name:'Bread',calories:150,date:'2024-02-29'}).expect(201);
    await api.post('/api/entries').send({name:'Tomorrow',calories:900,date:'2024-03-01'}).expect(201);
    // Read through an independently connected app to verify committed persistence.
    const second = await pool.connect();
    try {
      await second.query(`SET search_path TO ${schema}`);
      const day = (await request(createApp(repository(second))).get('/api/entries?date=2024-02-29').expect(200)).body;
      assert.equal(day.entries[0].protein,10); assert.equal(day.entries[0].carbs,20); assert.equal(day.entries[0].fat,5); assert.equal(day.total,400); assert.equal(day.entries.length,2); assert.equal(day.entries[0].date,'2024-02-29');
    } finally { second.release(); }
    await assert.rejects(client.query('INSERT INTO food_entries (id,name,calories,entry_date) VALUES ($1,$2,$3,$4)', [randomUUID(),'Bad',-1,'2024-02-29']));
    const lift=(await api.post('/api/lifts').send({exercise:'Squat',weight:135,unit:'lb',sets:3,reps:8,date:'2024-02-29'}).expect(201)).body;
    assert.equal((await api.get('/api/lifts?date=2024-02-29').expect(200)).body.entries[0].weight,135);
    assert.equal((await api.get('/api/lifts?date=2024-03-01').expect(200)).body.entries.length,0);
    await api.post('/api/lifts').send({exercise:'Bad',weight:-1,unit:'lb',sets:0,reps:8,date:'2024-02-29'}).expect(400);
    await api.delete(`/api/lifts/${lift.id}`).expect(204);
    await api.delete(`/api/lifts/${lift.id}`).expect(404);
    await api.get('/api/lifts?date=bad').expect(400);
    await api.delete(`/api/entries/${entry.id}`).expect(204);
    assert.equal((await api.get('/api/entries?date=2024-02-29')).body.total,150);
    await api.delete(`/api/entries/${entry.id}`).expect(404);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release(); await pool.end();
  }
});
