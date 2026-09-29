import { validateSituation } from '../public/shared.js';
import { presentAssessment, readAssessment, validId } from './storage.js';
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'X-Content-Type-Options': 'nosniff' };
const reply = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');
const cookie = (request, value, age) => `bahm_admin=${value}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
function present(row, admin = false) {
  const privateFields = admin ? { original_story: row.story, edited_story: row.edited_story ?? null, edited_at: row.edited_at ?? null } : {};
  try { return { ...presentAssessment(row), ...privateFields, featured: Boolean(row.featured_at) }; }
  catch { return { id: row.id, ...(row.title ? { title: row.title } : {}), story: row.edited_story ?? row.story, ...privateFields, created_at: row.created_at, status: row.status, state: 'unavailable', featured: Boolean(row.featured_at) }; }
}
export async function curation(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  try {
    if (path === '/api/gallery') {
      if (request.method !== 'GET') return reply({}, 405);
      const offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0));
      const { results } = await env.DB.prepare('SELECT * FROM assessments WHERE featured_at IS NOT NULL ORDER BY featured_at DESC, id DESC LIMIT 25 OFFSET ?').bind(offset).all();
      return reply({ stories: results.slice(0, 24).map(row => present(row)).filter(row => row.state === 'result'), next: results.length > 24 ? offset + 24 : null });
    }
    if (!env.ADMIN_PASSWORD || !env.DB) return reply({ error: 'Admin access is not configured.' }, 503);
    if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return reply({ error: 'Request rejected.' }, 403);
    if (path === '/api/admin/login') {
      if (request.method !== 'POST') return reply({}, 405);
      if (env.ADMIN_LIMITER && !(await env.ADMIN_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' })).success) return reply({ error: 'Too many attempts. Try again in a minute.' }, 429, { 'Retry-After': '60' });
      if (Number(request.headers.get('Content-Length')) > 2048) return reply({}, 413);
      const reader = request.body?.getReader();
      let bytes = 0, parts = [];
      if (!reader) return reply({}, 400);
      while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 2048) { await reader.cancel(); return reply({}, 413); } parts.push(value); }
      const body = JSON.parse(await new Blob(parts).text());
      const actual = await digest(typeof body.password === 'string' ? body.password : '');
      const expected = await digest(env.ADMIN_PASSWORD);
      let diff = 0; for (let i = 0; i < expected.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
      if (diff) return reply({ error: 'Incorrect password.' }, 401);
      const token = crypto.randomUUID() + crypto.randomUUID();
      await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(Date.now()).run();
      await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').bind(await digest(token), Date.now() + 28800000).run();
      return reply({ ok: true }, 200, { 'Set-Cookie': cookie(request, token, 28800) });
    }
    const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)bahm_admin=([^;]+)/)?.[1];
    const session = token && await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').bind(await digest(token)).first();
    if (!session || session.expires_at <= Date.now()) return reply({ error: 'Please sign in.' }, 401);
    if (path === '/api/admin/logout' && request.method === 'POST') {
      await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(await digest(token)).run();
      return reply({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
    }
    if (path === '/api/admin/stories' && request.method === 'GET') {
      const offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0));
      const filter = url.searchParams.get('filter');
      const conditions = filter === 'featured' ? ['featured_at IS NOT NULL'] : filter === 'unfeatured' ? ['featured_at IS NULL'] : [];
      const verdict = url.searchParams.get('verdict');
      const bindings = [];
      if (['yes', 'no'].includes(verdict)) {
        conditions.push(`status = 'completed' AND schema_version = 1 AND CASE WHEN json_valid(model_response) THEN json_extract(model_response, '$.answers.theme_alignment.choice') = 'yes' AND json_extract(model_response, '$.answers.evidence_sufficiency.choice') = 'yes' AND json_extract(model_response, '$.answers.asshole.choice') = ? ELSE 0 END`);
        bindings.push(verdict);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const { results } = await env.DB.prepare(`SELECT * FROM assessments ${where} ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET ?`).bind(...bindings, offset).all();
      return reply({ stories: results.slice(0, 24).map(row => present(row, true)), next: results.length > 24 ? offset + 24 : null });
    }
    const edit = path.match(/^\/api\/admin\/stories\/([^/]+)\/edit$/);
    if (edit) {
      if (request.method !== 'PUT') return reply({}, 405, { Allow: 'PUT' });
      if (!validId(edit[1])) return reply({}, 404);
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'Expected JSON.' }, 415);
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: 'Enter an edited story.' }, 400);
      let size = 0;
      const parts = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 40000) { await reader.cancel(); return reply({ error: 'Edited story is too large.' }, 413); }
        parts.push(value);
      }
      let body;
      try { body = JSON.parse(await new Blob(parts).text()); }
      catch { return reply({ error: 'Invalid JSON.' }, 400); }
      const error = validateSituation(body?.story);
      if (error) return reply({ error }, 400);
      if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim().length > 120)) return reply({ error: 'Keep the title to 120 characters or fewer.' }, 400);
      const row = await readAssessment(env.DB, edit[1]);
      if (!row) return reply({}, 404);
      if (row.status === 'pending') return reply({ error: 'Wait until the assessment has finished.' }, 409);
      await env.DB.prepare('UPDATE assessments SET edited_story = ?, edited_at = ?, title = ? WHERE id = ?')
        .bind(body.story.trim(), new Date().toISOString(), body.title === undefined ? row.title : body.title.trim() || null, row.id).run();
      return reply(present(await readAssessment(env.DB, row.id), true));
    }
    const match = path.match(/^\/api\/admin\/stories\/([^/]+)\/featured$/);
    if (match && ['PUT', 'DELETE'].includes(request.method)) {
      if (!validId(match[1])) return reply({}, 404);
      const row = await readAssessment(env.DB, match[1]);
      if (!row) return reply({}, 404);
      if (request.method === 'PUT' && present(row).state !== 'result') return reply({ error: 'Only completed assessments can be featured.' }, 409);
      await env.DB.prepare('UPDATE assessments SET featured_at = ? WHERE id = ?').bind(request.method === 'PUT' ? row.featured_at || new Date().toISOString() : null, row.id).run();
      return reply({ featured: request.method === 'PUT' });
    }
    return reply({}, 404);
  } catch { return reply({ error: 'Something went wrong. Please try again.' }, 503); }
}
