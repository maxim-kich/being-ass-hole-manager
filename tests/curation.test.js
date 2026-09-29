import test from 'node:test';
import assert from 'node:assert/strict';
import { DB } from './database.js';
import { curation } from '../src/curation.js';
import { scales } from '../public/shared.js';
const env = { DB, ADMIN_PASSWORD: 'test-only-long-password' };
const request = (path, method = 'GET', cookie, body, origin = 'https://test') => new Request(`https://test/api/${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = (...args) => curation(request(...args), env);
test('admin authentication, curation, public isolation, and logout', async () => {
  assert.equal((await call('admin/stories')).status, 401);
  assert.equal((await call('admin/login', 'POST', null, { password: 'wrong' })).status, 401);
  assert.equal((await call('admin/login', 'POST', null, { password: env.ADMIN_PASSWORD }, 'https://evil')).status, 403);
  const login = await call('admin/login', 'POST', null, { password: env.ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict.*Secure/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const choice = { type: 'choice', choice: 'yes', confidence: .9 };
  const payload = { answers: { theme_alignment: choice, evidence_sufficiency: choice, asshole: choice, ...Object.fromEntries(scales.map(({ id }) => [id, { type: 'score', score: 1, confidence: .8 }])) } };
  const id = crypto.randomUUID();
  await DB.prepare("INSERT INTO assessments (id,story,created_at,model,status,model_response) VALUES (?,'A complete story',?,'test','completed',?)").bind(id, new Date().toISOString(), JSON.stringify(payload)).run();
  assert.equal((await (await call('gallery')).json()).stories.length, 0);
  const stories = await (await call('admin/stories', 'GET', cookie)).json();
  assert.equal(stories.stories[0].story, 'A complete story');
  assert.equal((await call(`admin/stories/${id}/featured`, 'PUT')).status, 401);
  assert.equal((await call(`admin/stories/${id}/featured`, 'PUT', cookie, null, 'https://evil')).status, 403);
  assert.equal((await call(`admin/stories/${id}/featured`, 'PUT', cookie)).status, 200);
  const gallery = await (await call('gallery')).json();
  assert.equal(gallery.stories[0].id, id);
  assert.equal(gallery.stories[0].scores.length, 6);
  assert.equal((await (await call('admin/stories?filter=featured', 'GET', cookie)).json()).stories.length, 1);
  assert.equal((await (await call('admin/stories?filter=unfeatured', 'GET', cookie)).json()).stories.length, 0);
  await call(`admin/stories/${id}/featured`, 'DELETE', cookie);
  assert.equal((await (await call('admin/stories?filter=unfeatured', 'GET', cookie)).json()).stories[0].id, id);
  assert.equal((await (await call('gallery')).json()).stories.length, 0);
  await DB.prepare("UPDATE assessments SET status = 'failed' WHERE id = ?").bind(id).run();
  assert.equal((await call(`admin/stories/${id}/featured`, 'PUT', cookie)).status, 409);
  await call('admin/logout', 'POST', cookie);
  assert.equal((await call('admin/stories', 'GET', cookie)).status, 401);
});
test('expired sessions, login limits, and missing configuration deny access', async () => {
  assert.equal((await curation(request('admin/login', 'POST', null, { password: env.ADMIN_PASSWORD }), { ...env, ADMIN_LIMITER: { limit: async () => ({ success: false }) } })).status, 429);
  assert.equal((await curation(request('admin/stories'), { DB })).status, 503);
  const response = await call('admin/login', 'POST', null, { password: env.ADMIN_PASSWORD });
  const cookie = response.headers.get('set-cookie').split(';')[0];
  await DB.prepare('UPDATE admin_sessions SET expires_at = 0').run();
  assert.equal((await call('admin/stories', 'GET', cookie)).status, 401);
});

test('verdict filters combine with homepage selection and paginate matching submissions', async () => {
  await DB.prepare('DELETE FROM assessments').run();
  const login = await call('admin/login', 'POST', null, { password: env.ADMIN_PASSWORD });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const choice = value => ({ type: 'choice', choice: value, confidence: .9 });
  for (let i = 0; i < 29; i++) {
    const payload = { answers: { theme_alignment: choice('yes'), evidence_sufficiency: choice(i === 28 ? 'no' : 'yes'), asshole: choice(i < 26 ? 'yes' : 'no'), ...Object.fromEntries(scales.map(({ id }) => [id, { type: 'score', score: 1, confidence: .8 }])) } };
    await DB.prepare("INSERT INTO assessments (id,story,created_at,model,status,model_response,featured_at) VALUES (?, ?, ?, 'test','completed',?,?)").bind(crypto.randomUUID(), `Story ${i}`, new Date(2026, 0, i + 1).toISOString(), JSON.stringify(payload), i === 26 ? '2026-01-01' : null).run();
  }
  const list = async query => (await (await call(`admin/stories?${query}`, 'GET', cookie)).json());
  const first = await list('verdict=yes');
  assert.equal(first.stories.length, 24);
  assert.equal(first.next, 24);
  assert.ok(first.stories.every(story => story.verdict === 'yes'));
  assert.equal((await list('verdict=yes&offset=24')).stories.length, 2);
  assert.equal((await list('verdict=no')).stories.length, 2);
  assert.equal((await list('verdict=no&filter=featured')).stories[0].story, 'Story 26');
  assert.equal((await list('verdict=no&filter=unfeatured')).stories[0].story, 'Story 27');
  assert.equal((await list('verdict=yes&filter=featured')).stories.length, 0);
});

test('admin edits preserve originals and AI responses while public routes only expose the edited copy', async () => {
  const { default: worker } = await import('../src/worker.js');
  const login = await call('admin/login', 'POST', null, { password: env.ADMIN_PASSWORD });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const id = crypto.randomUUID();
  const choice = { type: 'choice', choice: 'yes', confidence: .9 };
  const payload = JSON.stringify({ answers: { theme_alignment: choice, evidence_sufficiency: choice, asshole: choice, ...Object.fromEntries(scales.map(({ id }) => [id, { type: 'score', score: 1, confidence: .8 }])) } });
  const original = 'Identifying name at a specific company repeatedly blamed colleagues.';
  await DB.prepare("INSERT INTO assessments (id,story,created_at,model,status,model_response,featured_at) VALUES (?, ?, ?, 'test', 'completed', ?, ?)").bind(id, original, new Date().toISOString(), payload, new Date().toISOString()).run();
  const route = `admin/stories/${id}/edit`;
  assert.equal((await call(route, 'PUT', null, { story: 'Edited' })).status, 401);
  assert.equal((await call(route, 'PUT', cookie, { story: 'Edited' }, 'https://evil')).status, 403);
  for (const story of ['', null, 'word '.repeat(501)]) assert.equal((await call(route, 'PUT', cookie, { story })).status, 400);
  assert.equal((await call(route, 'PUT', cookie, { story: 'x'.repeat(40001) })).status, 413);
  assert.equal((await call(route, 'PUT', cookie, { story: 'Edited', title: 'x'.repeat(121) })).status, 400);
  for (const text of ['A manager repeatedly blamed colleagues.', 'A manager blamed their team.']) {
    const response = await call(route, 'PUT', cookie, { story: text, title: 'A difficult meeting' });
    assert.equal(response.status, 200);
    const admin = await response.json();
    assert.equal(admin.original_story, original);
    assert.equal(admin.edited_story, text);
    const row = await DB.prepare('SELECT * FROM assessments WHERE id = ?').bind(id).first();
    assert.equal(row.story, original);
    assert.equal(row.model_response, payload);
    assert.equal(row.edited_story, text);
    assert.ok(row.edited_at);
    const result = await (await worker.fetch(new Request(`https://test/api/results/${id}`), env)).json();
    assert.equal(result.story, text);
    assert.equal(result.title, 'A difficult meeting');
    assert.equal(result.edited, true);
    assert.equal(result.verdict, 'yes');
    assert.ok(!JSON.stringify(result).includes(original));
    assert.ok(!('original_story' in result));
    const gallery = await (await call('gallery')).json();
    const card = gallery.stories.find(story => story.id === id);
    assert.equal(card.story, text);
    assert.equal(card.title, 'A difficult meeting');
    assert.ok(!('original_story' in card));
    assert.ok(!JSON.stringify(gallery).includes(original));
  }
  const cleared = await (await call(route, 'PUT', cookie, { story: 'A manager blamed their team.', title: '' })).json();
  assert.ok(!cleared.title);
  const adminList = await (await call('admin/stories', 'GET', cookie)).json();
  assert.equal(adminList.stories.find(story => story.id === id).original_story, original);
  // A manual deletion of the record removes both copies and the result from public access.
  await DB.prepare('DELETE FROM assessments WHERE id = ?').bind(id).run();
  assert.equal((await worker.fetch(new Request(`https://test/api/results/${id}`), env)).status, 404);
  assert.ok(!(await (await call('gallery')).json()).stories.some(story => story.id === id));
  assert.equal((await call(route, 'PUT', cookie, { story: 'Missing' })).status, 404);
});
