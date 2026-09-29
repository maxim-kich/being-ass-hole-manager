import test from 'node:test';
import assert from 'node:assert/strict';
import { shortResultCode, resultIdFromCode, shareLink } from '../public/share-link.js';
import worker from '../src/worker.js';
test('compact links preserve the entire saved UUID and resolve to its result page', async () => {
  for (let i = 0; i < 30; i++) {
    const id = crypto.randomUUID();
    const code = shortResultCode(id);
    assert.equal(code.length, 22);
    assert.equal(resultIdFromCode(code), id);
    const url = shareLink('https://bahm.example', {state:'result',id});
    const response = await worker.fetch(new Request(url), {});
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), `https://bahm.example/results/${id}`);
  }
});
test('non-result sharing goes home and invalid compact links fail safely', async () => {
  for (const state of ['failed','insufficient','off-topic',undefined]) assert.equal(shareLink('https://bahm.example', {state,id:crypto.randomUUID()}), 'https://bahm.example/');
  for (const code of ['bad', 'a'.repeat(23), '../example.com', 'A'.repeat(22)]) {
    assert.equal((await worker.fetch(new Request(`https://bahm.example/s/${encodeURIComponent(code)}`), {})).status,404);
  }
});
