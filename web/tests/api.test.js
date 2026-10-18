import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { validDate } from '../server/validation.js';
import { memoryStore } from './helpers.js';

async function setup({ nutritionSearch, overrides = {} } = {}) {
  const store = Object.assign(memoryStore(), overrides);
  const app = createApp(store, nutritionSearch);
  const api = request.agent(app);
  await api.post('/api/auth/register').send({ name: 'Rohit', email: 'rohit@example.com', password: 'Correct horse 123' }).expect(201);
  return { api, store, app };
}
test('calendar dates reject impossible days and accept leap days', () => {
  for (const date of ['2026-02-29', '2026-04-31', 'bad', '0000-01-01', '2026-1-01', null]) assert.equal(validDate(date), false);
  for (const date of ['2024-02-29', '2026-10-16', '0001-01-01']) assert.equal(validDate(date), true);
});
test('add/list/delete, daily totals and date isolation', async () => {
  const { api } = await setup();
  const first = await api.post('/api/entries').send({ name: '  Toast  ', calories: 320, date: '2026-10-16' }).expect(201);
  assert.equal(first.body.name, 'Toast');
  await api.post('/api/entries').send({ name: 'Tea', calories: 0, date: '2026-10-16' }).expect(201);
  await api.post('/api/entries').send({ name: 'Lunch', calories: 600, date: '2026-10-17' }).expect(201);
  let day = await api.get('/api/entries?date=2026-10-16').expect(200);
  assert.equal(day.body.total, 320); assert.equal(day.body.entries.length, 2);
  await api.delete(`/api/entries/${first.body.id}`).expect(204);
  day = await api.get('/api/entries?date=2026-10-16').expect(200);
  assert.equal(day.body.total, 0); assert.equal(day.body.entries.length, 1);
  await api.delete(`/api/entries/${first.body.id}`).expect(404);
});
test('invalid requests cannot be stored', async () => {
  const { api } = await setup();
  const base = { name: 'Food', calories: 1, date: '2026-10-16' };
  for (const change of [{name:' '},{name:'x'.repeat(121)},{calories:-1},{calories:1.5},{calories:'20'},{calories:100001},{calories:null},{date:'2026-02-30'}]) await api.post('/api/entries').send({...base,...change}).expect(400);
  await api.get('/api/entries').expect(400);
  await api.get('/api/entries?date=x').expect(400);
  await api.delete('/api/entries/not-a-uuid').expect(400);
  await api.post('/api/entries').set('Content-Type','application/json').send('{').expect(400);
  await api.get('/api/unknown').expect(404);
});
test('database errors return a useful response without private details', async () => {
  const { api } = await setup({ overrides: { list: async () => { throw new Error('test failure'); } } });
  const response = await api.get('/api/entries?date=2026-10-16').expect(503);
  assert.match(response.body.error, /database/);
  assert.doesNotMatch(response.text, /test failure/);
});
test('nutrition search validates queries and reports upstream failures', async () => {
  const { api } = await setup({ nutritionSearch: async q => [{id:1,name:q,calories:100,protein:2,carbs:20,fat:1}] });
  await api.get('/api/foods/search?q=x').expect(400);
  const result = await api.get('/api/foods/search?q=oats').expect(200);
  assert.equal(result.body.foods[0].name,'oats');
  const { api: broken } = await setup({ nutritionSearch: async () => {throw new Error('Nutrition search unavailable.')} });
  await broken.get('/api/foods/search?q=oats').expect(502);
});
test('food and lift diaries are isolated by account, including deletes', async () => {
  const { api, store, app } = await setup();
  const other = request.agent(app);
  await other.post('/api/auth/register').send({name:'Sam',email:'sam@example.com',password:'Another password 123'}).expect(201);
  const food = (await api.post('/api/entries').send({name:'Soup',calories:300,date:'2026-10-16'}).expect(201)).body;
  const lift = (await api.post('/api/lifts').send({exercise:'Squat',weight:135,unit:'lb',sets:3,reps:8,date:'2026-10-16'}).expect(201)).body;
  // Legacy rows remain stored without becoming visible to a new account.
  store.foods.push({id:'legacy-food',name:'Legacy',calories:100,date:'2026-10-16'});
  store.lifts.push({id:'legacy-lift',exercise:'Legacy',weight:1,unit:'lb',sets:1,reps:1,date:'2026-10-16'});
  assert.deepEqual((await other.get('/api/entries?date=2026-10-16').expect(200)).body,{entries:[],total:0});
  assert.deepEqual((await other.get('/api/lifts?date=2026-10-16').expect(200)).body,{entries:[]});
  await other.delete(`/api/entries/${food.id}`).expect(404);
  await other.delete(`/api/lifts/${lift.id}`).expect(404);
  assert.equal((await api.get('/api/entries?date=2026-10-16').expect(200)).body.total,300);
  assert.equal((await api.get('/api/lifts?date=2026-10-16').expect(200)).body.entries.length,1);
  await api.delete(`/api/lifts/${lift.id}`).expect(204);
  assert.equal(store.foods.some(row=>row.id==='legacy-food'),true);
});
