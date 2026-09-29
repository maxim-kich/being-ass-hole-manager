import test from 'node:test';
import { DB } from './database.js';
import assert from 'node:assert/strict';
import { buildQuestions, interpretResponse } from '../src/assessment.js';
import { handleAssessment } from '../src/worker.js';
import { scales, validateSituation, wordCount } from '../public/shared.js';

const choice = value => ({ type: 'choice', choice: value, confidence: .9 });
function fixture(verdict = 'yes') {
  return { answers: {
    theme_alignment: choice('yes'), evidence_sufficiency: choice('yes'), asshole: choice(verdict),
    ...Object.fromEntries(scales.map(({ id }) => [id, { type: 'score', score: 2.4, confidence: .8 }]))
  } };
}
const request = (situation, options = {}) => new Request('https://manager.example/api/assess', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://manager.example', ...options.headers },
  body: JSON.stringify({ situation })
});

test('word cap rejects oversized submissions without imposing a minimum story length', () => {
  assert.equal(wordCount('  one\n two\tthree '), 3);
  assert.equal(validateSituation('word '.repeat(500)), null);
  assert.ok(validateSituation('word '.repeat(501)));
  assert.equal(validateSituation('x'.repeat(6001)), null);
  assert.ok(validateSituation('   '));
  assert.ok(validateSituation({ text: 'hello' }));
  assert.equal(validateSituation('My manager shouted.'), null);
});
test('off-topic and insufficient states suppress verdicts and all scores', () => {
  assert.deepEqual(interpretResponse({ answers: { theme_alignment: choice('no') } }), { state: 'off-topic' });
  assert.deepEqual(interpretResponse({ answers: { theme_alignment: choice('yes'), evidence_sufficiency: choice('no') } }), { state: 'insufficient' });
});
test('both verdicts preserve confidence and map zero-based scores to 1–5', () => {
  for (const verdict of ['yes', 'no']) {
    const data = fixture(verdict);
    data.answers.transparency.score = 0;
    data.answers.support.score = 4;
    const result = interpretResponse(data);
    assert.equal(result.verdict, verdict);
    assert.equal(result.confidence, .9);
    assert.equal(result.scores.length, 6);
    assert.equal(result.scores[0].value, 1);
    assert.equal(result.scores[5].value, 5);
  }
});
test('malformed upstream answers never turn into a reassuring default result', () => {
  for (const bad of [null, {}, { answers: { theme_alignment: choice('maybe') } }]) assert.throws(() => interpretResponse(bad));
  const bad = fixture();
  bad.answers.fairness.score = 5;
  assert.throws(() => interpretResponse(bad));
  bad.answers.fairness.score = 2;
  delete bad.answers.support;
  assert.throws(() => interpretResponse(bad));
});
test('one authenticated upstream request contains all nine fixed questions', async () => {
  let calls = 0;
  const response = await handleAssessment(request('My manager yelled at me in front of the team.'), { DB, JEV_API_KEY: 'test-secret' }, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(init.headers.Authorization, 'Bearer test-secret');
    const payload = JSON.parse(init.body);
    assert.equal(payload.model, 'jev-latest');
    assert.equal(Object.keys(payload.questions).length, 9);
    assert.deepEqual(payload.questions, buildQuestions());
    return Response.json(fixture());
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(!(await response.text()).includes('test-secret'));
});
test('invalid input, missing credentials and cross-origin posts never call JEV', async () => {
  const noCall = () => { throw new Error('Must not call upstream'); };
  assert.equal((await handleAssessment(request('word '.repeat(501)), { DB, JEV_API_KEY: 'test' }, noCall)).status, 400);
  assert.equal((await handleAssessment(request('My manager shouted.'), {}, noCall)).status, 503);
  assert.equal((await handleAssessment(request('My manager shouted.', { headers: { Origin: 'https://elsewhere.example' } }), { DB, JEV_API_KEY: 'test' }, noCall)).status, 403);
});
test('rate limiting stops provider calls and gives a retry interval', async () => {
  const env = { DB, JEV_API_KEY: 'test', ASSESSMENT_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await handleAssessment(request('My manager shouted.'), env, () => { throw new Error('Must not call upstream'); });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
});
test('body limits, malformed JSON and unsupported methods are rejected', async () => {
  const large = new Request('https://manager.example/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(40001) });
  assert.equal((await handleAssessment(large, {})).status, 413);
  const malformed = new Request('https://manager.example/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal((await handleAssessment(malformed, {})).status, 400);
  assert.equal((await handleAssessment(new Request('https://manager.example/api/assess'), {})).status, 405);
});
test('provider failures are recoverable and do not expose upstream details', async () => {
  for (const status of [401, 429, 500, 529]) {
    const response = await handleAssessment(request('My manager shouted.'), { DB, JEV_API_KEY: 'test' }, async () => new Response('private provider error', { status }));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.status, 'failed');
    assert.ok(!JSON.stringify(data).includes('private provider error'));
  }
  const response = await handleAssessment(request('My manager shouted.'), { DB, JEV_API_KEY: 'test' }, async () => Response.json({ answers: {} }));
  assert.equal((await response.json()).status, 'failed');
});
