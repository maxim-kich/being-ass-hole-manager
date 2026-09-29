import { requestErrors } from '../public/request-errors.js';
import { curation } from './curation.js';
import { resultIdFromCode } from '../public/share-link.js';
import { shareData, shareTags, SHARE_IMAGE_VERSION } from '../public/share-data.js';
import { validateSituation } from '../public/shared.js';
import { buildQuestions, interpretResponse } from './assessment.js';
import { validId, readAssessment, presentAssessment } from './storage.js';

const MAX_BODY_BYTES = 40000;
function json(data, status = 200, headers = {}) {
  if (status === 429 && requestErrors[data?.code]) data = { code: data.code, error: requestErrors[data.code] };
  else if (status >= 400) data = { error: 'Something went wrong. Please try again later.' };
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', ...headers } });
}
async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function handleAssessment(request, env, upstreamFetch = fetch) {
  if (request.method !== 'POST') return json({ error: 'Use POST for assessments.' }, 405, { Allow: 'POST' });
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Please submit from this website.' }, 403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Expected a JSON request.' }, 415);
  let body;
  try { body = await readBody(request); }
  catch (error) { return json({ error: error instanceof RangeError ? 'Your story is too large. Please shorten it.' : 'The request could not be read.' }, error instanceof RangeError ? 413 : 400); }
  const validation = validateSituation(body?.situation);
  if (validation) return json({ error: validation }, 400);
  if (body.id !== undefined && !validId(body.id)) return json({}, 400);
  if (!env.DB) return json({}, 503);
  const id = body.id || crypto.randomUUID();
  try {
    const existing = await readAssessment(env.DB, id);
    if (existing) {
      if (existing.story !== body.situation) return json({}, 409);
      return json(presentAssessment(existing));
    }
  } catch { return json({}, 503); }
  if (!env.JEV_API_KEY) return json({ error: 'Assessments are not connected yet. Please try again later.' }, 503);
  if (env.ASSESSMENT_LIMITER) {
    const { success } = await env.ASSESSMENT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
    if (!success) return json({ code: 'ip_limit' }, 429, { 'Retry-After': '60' });
  }
  const model = env.JEV_MODEL || 'jev-latest';
  try {
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO assessments (id, story, created_at, model, status, schema_version) VALUES (?, ?, ?, ?, 'pending', 1)")
      .bind(id, body.situation, new Date().toISOString(), model).run();
    if (!inserted.meta.changes) {
      const existing = await readAssessment(env.DB, id);
      if (existing.story !== body.situation) return json({}, 409);
      return json(presentAssessment(existing));
    }
  } catch (error) {
    if (String(error?.message).includes('DAILY_ASSESSMENT_LIMIT')) {
      const now = Date.now();
      const retryAfter = Math.ceil((Date.parse(new Date(now).toISOString().slice(0, 10)) + 86400000 - now) / 1000);
      return json({ code: 'daily_limit' }, 429, { 'Retry-After': String(retryAfter) });
    }
    return json({}, 503);
  }
  try {
    const response = await upstreamFetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.JEV_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, state: { situation: body.situation.trim() }, questions: buildQuestions() }),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error('Provider failed');
    const payload = await response.json();
    // Retain the original JSON, including responses that cannot be rendered.
    await env.DB.prepare('UPDATE assessments SET model_response = ? WHERE id = ?')
      .bind(JSON.stringify(payload), id).run();
    interpretResponse(payload);
    await env.DB.prepare("UPDATE assessments SET status = 'completed' WHERE id = ? AND status = 'pending'").bind(id).run();
  } catch {
    try { await env.DB.prepare("UPDATE assessments SET status = 'failed' WHERE id = ? AND status = 'pending'").bind(id).run(); }
    catch { return json({}, 503); }
  }
  try { return json(presentAssessment(await readAssessment(env.DB, id))); }
  catch { return json({}, 503); }

}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/gallery' || pathname.startsWith('/api/admin/')) return curation(request, env);
    if (pathname.startsWith('/s/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return json({}, 405, { Allow: 'GET, HEAD' });
      const code = pathname.slice(3);
      const id = resultIdFromCode(code);
      if (!id || !validId(id)) return json({}, 404);
      return new Response(null, { status: 302, headers: {
        Location: new URL(`/results/${id}`, request.url).href,
        'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive'
      } });
    }
    if (pathname === '/api/assess') return handleAssessment(request, env);
    const result = pathname.match(/^\/api\/results\/([^/]+)$/);
    if (result) {
      if (request.method !== 'GET') return json({}, 405, { Allow: 'GET' });
      if (!validId(result[1])) return json({}, 404);
      try {
        const row = await readAssessment(env.DB, result[1]);
        return row ? json(presentAssessment(row)) : json({}, 404);
      } catch { return json({}, 503); }
    }
    if (pathname.startsWith('/share/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return json({}, 405, { Allow: 'GET, HEAD' });
      if (/^\/share\/(home|yes|no)\.png$/.test(pathname)) return env.ASSETS.fetch(request);
      // Preserve previously shared per-result image URLs without rendering.
      const match = pathname.match(/^\/share\/([^/]+)\.png$/);
      if (!match || !validId(match[1])) return json({}, 404);
      try {
        const row = await readAssessment(env.DB, match[1]);
        if (!row) return json({}, 404);
        const data = presentAssessment(row);
        if (data.state !== 'result') return json({}, 404);
        return new Response(null, { status: 302, headers: {
          Location: new URL(`/share/${data.verdict}.png?v=${SHARE_IMAGE_VERSION}`, request.url).href,
          'Cache-Control': 'public, max-age=86400'
        } });
      } catch { return json({}, 503); }
    }
    if (pathname === '/' || pathname === '/index.html' || pathname.startsWith('/results/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return json({}, 405, { Allow: 'GET, HEAD' });
      const match = pathname.match(/^\/results\/([^/]+)$/);
      let status = pathname.startsWith('/results/') ? 404 : 200;
      let data;
      if (match && validId(match[1])) {
        try { const row = await readAssessment(env.DB, match[1]); status = row ? 200 : 404; if (row) data = presentAssessment(row); }
        catch { status = 503; }
      }
      const shell = await env.ASSETS.fetch(new Request(new URL('/', request.url), { method: 'GET' }));
      const headers = new Headers(shell.headers);
      headers.set('Cache-Control', 'no-store');
      headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.delete('Content-Length');
      headers.delete('ETag');
      let html = await shell.text();
      html = html.replace(/<title>.*?<\/title>/s, '').replace(/<meta name="description"[^>]*>/, '');
      const meta = shareData(env.SITE_URL || new URL(request.url).origin, data?.state === 'result' ? data : undefined);
      html = html.replace('</head>', `${shareTags(meta)}\n</head>`);
      return new Response(request.method === 'HEAD' ? null : html, { status, headers });
    }
    if (pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  }
};
