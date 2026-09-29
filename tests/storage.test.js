import test from 'node:test';
import assert from 'node:assert/strict';
import { DB } from './database.js';
import worker, { handleAssessment } from '../src/worker.js';
import { scales } from '../public/shared.js';
import { readAssessment } from '../src/storage.js';
const choice = choice => ({ type: 'choice', choice, confidence: .9 });
const payload = { answers: { theme_alignment: choice('yes'), evidence_sufficiency: choice('yes'), asshole: choice('no'), ...Object.fromEntries(scales.map(({ id }) => [id, { type: 'score', score: 3, confidence: .8 }])) }, usage: { input_tokens: 100 } };
const post = (id, situation = '  My manager offered help.\n') => new Request('https://test/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, situation }) });
const get = id => worker.fetch(new Request(`https://test/api/results/${id}`), { DB });

test('raw response and exact story persist; reopening reconstructs the same result without provider access', async () => {
  const id = crypto.randomUUID();
  const response = await handleAssessment(post(id), { DB, JEV_API_KEY: 'test' }, async () => Response.json(payload));
  const result = await response.json();
  assert.equal(result.status, 'completed');
  assert.equal(result.verdict, 'no');
  assert.equal(result.scores[0].value, 4);
  const row = await readAssessment(DB, id);
  assert.equal(row.story, '  My manager offered help.\n');
  assert.deepEqual(JSON.parse(row.model_response), payload);
  assert.equal(row.schema_version, 1);
  assert.deepEqual(await (await get(id)).json(), result);
  const duplicate = await handleAssessment(post(id), { DB }, () => { throw new Error('Must not call provider'); });
  assert.deepEqual(await duplicate.json(), result);
  assert.equal((await handleAssessment(post(id, 'Changed story'), { DB })).status, 409);
});

test('simultaneous duplicate submissions make exactly one provider call', async () => {
  const id = crypto.randomUUID();
  let calls = 0;
  const upstream = async () => { calls++; return Response.json(payload); };
  const responses = await Promise.all([handleAssessment(post(id), { DB, JEV_API_KEY: 'test' }, upstream), handleAssessment(post(id), { DB, JEV_API_KEY: 'test' }, upstream)]);
  assert.equal(calls, 1);
  for (const response of responses) assert.equal(response.status, 200);
});

test('gated results persist and remain readable', async () => {
  for (const [state, answers] of [['off-topic', { theme_alignment: choice('no') }], ['insufficient', { theme_alignment: choice('yes'), evidence_sufficiency: choice('no') }]]) {
    const id = crypto.randomUUID();
    await handleAssessment(post(id), { DB, JEV_API_KEY: 'test' }, async () => Response.json({ answers }));
    assert.equal((await (await get(id)).json()).state, state);
  }
});

test('interrupted pending records become failed, and malformed raw responses are retained', async () => {
  const id = crypto.randomUUID();
  await DB.prepare("INSERT INTO assessments (id, story, created_at, model, status) VALUES (?, 'test', '2020-01-01T00:00:00.000Z', 'test', 'pending')").bind(id).run();
  assert.equal((await (await get(id)).json()).status, 'failed');
  const invalidId = crypto.randomUUID();
  await handleAssessment(post(invalidId), { DB, JEV_API_KEY: 'test' }, async () => Response.json({ unexpected: true }));
  const row = await readAssessment(DB, invalidId);
  assert.equal(row.status, 'failed');
  assert.deepEqual(JSON.parse(row.model_response), { unexpected: true });
});

test('unknown IDs, unsupported mutations, unavailable storage and incompatible versions fail safely', async () => {
  assert.equal((await get(crypto.randomUUID())).status, 404);
  assert.equal((await get('invalid')).status, 404);
  const id = crypto.randomUUID();
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await worker.fetch(new Request(`https://test/api/results/${id}`, { method }), { DB })).status, 405);
  let calls = 0;
  assert.equal((await handleAssessment(post(id), { JEV_API_KEY: 'test' }, () => { calls++; })).status, 503);
  assert.equal(calls, 0);
  await DB.prepare("INSERT INTO assessments (id, story, created_at, model, status, schema_version, model_response) VALUES (?, 'test', ?, 'test', 'completed', 99, '{}')").bind(id, new Date().toISOString()).run();
  assert.equal((await get(id)).status, 503);
});
