import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { handleAssessment } from '../src/worker.js';
import { DB } from './database.js';
import { scales } from '../public/shared.js';
import { shareTags, resultDescription, homeShare } from '../public/share-data.js';
const ASSETS = { async fetch(request) {
  const path = new URL(request.url).pathname;
  return new Response(await readFile(new URL(path === '/' ? '../public/index.html' : `../public${path}`, import.meta.url)), { headers: { 'Content-Type': path.endsWith('.png') ? 'image/png' : 'text/html' } });
} };
const env = { DB, ASSETS };
const request = (path, method = 'GET') => worker.fetch(new Request(`https://bahm.example${path}`, { method }), env);
test('home HTML provides absolute crawler metadata and a real 1200x630 PNG', async () => {
  const html = await (await request('/')).text();
  assert.match(html, /property="og:image" content="https:\/\/bahm.example\/share\/home.png\?v=14"/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  const response = await request('/share/home.png');
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.equal(bytes.readUInt32BE(16),1200); assert.equal(bytes.readUInt32BE(20),630);
});
test('saved results include escaped story descriptions and static verdict image URLs', async () => {
  for (const verdict of ['yes','no']) {
    const id = crypto.randomUUID();
    const choice = choice => ({ type:'choice', choice, confidence:.9 });
    const payload = { answers: { theme_alignment:choice('yes'), evidence_sufficiency:choice('yes'), asshole:choice(verdict), ...Object.fromEntries(scales.map(s => [s.id, {type:'score',score:2,confidence:.8}])) } };
    await handleAssessment(new Request('https://bahm.example/api/assess', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,situation:'Private story text <script>secret</script>'})}), {...env,JEV_API_KEY:'test'}, async () => Response.json(payload));
    const response = await request(`/results/${id}`); const html = await response.text();
    assert.equal(response.status,200); assert.ok(html.includes(`https://bahm.example/share/${verdict}.png`));
    assert.ok(html.includes(verdict === 'yes' ? 'This behavior crosses the line' : 'This behavior doesn’t cross the line')); assert.ok(html.includes('Private story text &lt;script&gt;secret&lt;/script&gt;')); assert.ok(!html.includes('<script>secret</script>'));
    const legacy = await request(`/share/${id}.png`); assert.equal(legacy.status,302); assert.ok(legacy.headers.get('Location').includes(`/share/${verdict}.png`));
    assert.equal(await (await request(`/results/${id}`,'HEAD')).text(),'');
  }
  assert.equal((await request('/share/invalid.png')).status,404);
  assert.equal((await request(`/share/${crypto.randomUUID()}.png`)).status,404);
});
test('metadata escapes attribute and markup delimiters', () => {
  const tags = shareTags({ title:'<script>"&',description:'" onload="bad',url:'https://example.com/',image:'image',imageAlt:'alt' });
  assert.ok(!tags.includes('<script>')); assert.ok(tags.includes('&quot; onload=&quot;bad'));
});

test('result descriptions fit 200 Unicode characters including quotes and the complete suffix', () => {
  for (const story of ['Short story.', 'word '.repeat(200), 'x'.repeat(500), '🙂'.repeat(150), 'Multiple\nlines\tand   spaces']) {
    const description = resultDescription(story);
    assert.ok(Array.from(description).length <= 200);
    assert.ok(description.startsWith('"'));
    assert.ok(description.endsWith(`" — ${homeShare.description}`));
  }
  assert.equal(resultDescription('Short story.'), `"Short story." — ${homeShare.description}`);
  assert.ok(resultDescription('x'.repeat(500)).includes('…" — '));
});
test('result images are static and do not depend on the story', async () => {
  const { shareSvg } = await import('../src/share.js');
  for (const verdict of ['yes', 'no']) {
    assert.equal(shareSvg({state:'result',verdict,story:'First story'}), shareSvg({state:'result',verdict,story:'Different story'}));
    const response = await request(`/share/${verdict}.png`);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Content-Type'),'image/png');
  }
});

test('configured production origin controls canonical and social URLs on alternate hosts', async () => {
  const response = await worker.fetch(new Request('https://preview.example/'), { ...env, SITE_URL: 'https://bahm.maximkich.com' });
  const html = await response.text();
  assert.ok(html.includes('<link rel="canonical" href="https://bahm.maximkich.com/">'));
  assert.ok(html.includes('property="og:url" content="https://bahm.maximkich.com/"'));
  assert.ok(html.includes('property="og:image" content="https://bahm.maximkich.com/share/home.png'));
  assert.ok(html.includes('name="twitter:image" content="https://bahm.maximkich.com/share/home.png'));
  assert.ok(!html.includes('https://preview.example'));
});

test('homepage is indexable while result pages and admin stay excluded', async () => {
  for (const path of ['/', '/index.html']) {
    const response = await request(path);
    assert.equal(response.headers.get('X-Robots-Tag'), 'index, follow');
    assert.match(await response.text(), /<meta name="robots" content="index, follow">/);
  }
  const response = await request(`/results/${crypto.randomUUID()}`);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
  assert.match(await response.text(), /<meta name="robots" content="noindex, nofollow, noarchive">/);
  const admin = await readFile(new URL('../public/fucked-up-stories.html', import.meta.url), 'utf8');
  assert.match(admin, /<meta name="robots" content="noindex,nofollow,noarchive">/);
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /X-Robots-Tag: noindex, nofollow, noarchive/);
});
