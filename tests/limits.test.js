import test from 'node:test';
import assert from 'node:assert/strict';
import { DB } from './database.js';
import { handleAssessment } from '../src/worker.js';
const day = new Date().toISOString().slice(0, 10);
const env = { DB, JEV_API_KEY: 'test' };
const post = (id = crypto.randomUUID(), ip = '192.0.2.1') => new Request('https://test/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify({ id, situation: 'My manager offered help.' }) });
const count = async () => (await DB.prepare('SELECT used FROM assessment_daily_usage WHERE day = ?').bind(day).first()).used;
const setCount = used => DB.prepare('INSERT INTO assessment_daily_usage(day, used) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET used = excluded.used').bind(day, used).run();

test('concurrent final-slot requests admit one provider call; duplicates and failures do not bypass the cap', async () => {
  await setCount(6999);
  let calls = 0;
  const ids = Array.from({ length: 8 }, () => crypto.randomUUID());
  const responses = await Promise.all(ids.map(id => handleAssessment(post(id), env, async () => { calls++; return new Response('failure', { status: 500 }); })));
  assert.equal(calls, 1);
  assert.equal(await count(), 7000);
  assert.equal(responses.filter(r => r.status === 200).length, 1);
  const winner = ids[responses.findIndex(r => r.status === 200)];
  for (let i = 0; i < responses.length; i++) {
    if (ids[i] === winner) continue;
    assert.equal(responses[i].status, 429);
    assert.equal((await responses[i].json()).code, 'daily_limit');
    assert.ok(Number(responses[i].headers.get('Retry-After')) > 0);
    assert.ok(Number(responses[i].headers.get('Retry-After')) <= 86400);
    assert.equal(await DB.prepare('SELECT id FROM assessments WHERE id = ?').bind(ids[i]).first(), null);
  }
  assert.equal((await handleAssessment(post(winner), env, () => { throw Error('duplicate upstream'); })).status, 200);
  assert.equal(await count(), 7000);
});

test('UTC dates have independent counters, and concurrent duplicate IDs reserve only one slot', async () => {
  await setCount(0);
  await DB.prepare("INSERT INTO assessment_daily_usage(day, used) VALUES ('2000-01-01', 7000)").run();
  const id = crypto.randomUUID();
  let calls = 0;
  await Promise.all([1, 2, 3].map(() => handleAssessment(post(id), env, async () => { calls++; return Response.json({ answers: { theme_alignment: { type: 'choice', choice: 'no', confidence: .9 } } }); })));
  assert.equal(calls, 1);
  assert.equal(await count(), 1);
});

test('IP rejection returns its own error, checks the connecting IP, and consumes no daily slot', async () => {
  await setCount(0);
  const seen = new Set();
  const limitedEnv = { ...env, ASSESSMENT_LIMITER: { limit: async ({ key }) => { const success = !seen.has(key); seen.add(key); return { success }; } } };
  let calls = 0;
  const upstream = async () => { calls++; return new Response('', { status: 500 }); };
  assert.equal((await handleAssessment(post(), limitedEnv, upstream)).status, 200);
  const denied = await handleAssessment(post(), limitedEnv, upstream);
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Retry-After'), '60');
  assert.equal((await denied.json()).code, 'ip_limit');
  assert.equal(await count(), 1);
  assert.equal((await handleAssessment(post(crypto.randomUUID(), '192.0.2.2'), limitedEnv, upstream)).status, 200);
  assert.equal(calls, 2);
});
