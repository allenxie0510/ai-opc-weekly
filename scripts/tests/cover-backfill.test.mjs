import test from 'node:test';
import assert from 'node:assert/strict';
import { runBackfill } from '../backfill-covers.mjs';
import { generateOpportunityCover, seedreamGenerate, describeCoverError } from '../lib/cover.mjs';

const row = { id: 'selected-id', slug: 'selected', title: 'Selected opportunity', cover_url: 'https://storage.test/old.png' };

test('targeted regeneration selects only the requested opportunity and replaces after success', async () => {
  const calls = [];
  const result = await runBackfill({ slugs: ['selected'] }, {
    query: async (path, options) => {
      calls.push({ path, options });
      if (!options) {
        assert.match(path, /slug=eq.selected/);
        assert.doesNotMatch(path, /cover_url=is.null|limit=50/);
        return [row];
      }
      assert.equal(calls.length, 2);
      assert.equal(options.method, 'PATCH');
      assert.equal(options.headers.Prefer, 'return=representation');
      return [{ ...row, ...JSON.parse(options.body) }];
    },
    generateCover: async (selected, opts) => {
      assert.equal(calls.length, 1, 'old cover must not be cleared before generation');
      assert.equal(selected.cover_url, row.cover_url);
      assert.equal(opts.forceGenerate, true);
      return 'https://storage.test/new.png';
    },
    seedHashes: async () => assert.fail('no need to download all old covers for targeted AI generation'),
    wait: async () => {},
  });
  assert.deepEqual(result, { ok: 1, fail: 0 });
  assert.equal(JSON.parse(calls[1].options.body).cover_url, 'https://storage.test/new.png');
});

test('generation failure reports failure without clearing or updating the old cover', async () => {
  await assert.rejects(runBackfill({ slugs: ['selected'] }, {
    query: async (_path, options) => { assert.equal(options, undefined); return [row]; },
    generateCover: async () => '', wait: async () => {},
  }), /回填失败 1 条/);
});

test('missing target fails instead of silently processing other missing covers', async () => {
  await assert.rejects(runBackfill({ slugs: ['missing'] }, {
    query: async () => [], generateCover: async () => assert.fail('must not generate'),
  }), /未找到/);
});

test('empty database update response cannot be reported as a saved cover', async () => {
  await assert.rejects(runBackfill({ slugs: ['selected'] }, {
    query: async (_path, options) => options ? [] : [row],
    generateCover: async () => 'https://storage.test/new.png', wait: async () => {},
  }), /回填失败/);
});

test('automatic backfill still selects only missing covers and allows evidence images', async () => {
  await runBackfill({}, {
    query: async path => { assert.match(path, /cover_url=is.null/); return []; },
    generateCover: async () => assert.fail('no rows'),
  });
});

test('Seedream retries a network reset and timeout before returning an image', async () => {
  let calls = 0;
  const delays = [];
  const url = await seedreamGenerate('test-key', 'a print studio', {
    request: async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      if (calls === 2) throw new DOMException('request timed out', 'TimeoutError');
      return Response.json({ data: [{ url: 'https://images.test/fresh.png' }] });
    }, wait: async ms => delays.push(ms),
  });
  assert.equal(url, 'https://images.test/fresh.png');
  assert.deepEqual(delays, [10000, 20000]);
});

test('Seedream permanent authorization errors do not get retried', async () => {
  let calls = 0;
  await assert.rejects(seedreamGenerate('test-key', 'a print studio', {
    request: async () => { calls++; return new Response('Unauthorized', { status: 401 }); },
    wait: async () => assert.fail('must not retry a bad key'),
  }), /401/);
  assert.equal(calls, 1);
});

test('network diagnostics retain cause codes', () => {
  assert.match(describeCoverError(new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })), /ECONNRESET/);
});

test('manual generation skips source images and uploads a fresh content-addressed image', async t => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: 'https://storage.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    ARK_API_KEY: 'test-key', ZHIPU_API_KEY: 'test-key',
  })) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url));
    if (String(url).endsWith('/storage/v1/bucket')) return new Response('{}', { status: 201 });
    if (String(url).includes('chat/completions')) return Response.json({ choices: [{ message: { content: 'A colorful screen printing studio with an organized pattern library.' } }] });
    if (String(url).includes('/images/generations')) return Response.json({ data: [{ url: 'https://images.test/new.png' }] });
    if (url === 'https://images.test/new.png') return new Response(Buffer.alloc(2048, 42), { headers: { 'content-type': 'image/png' } });
    if (String(url).includes('/storage/v1/object/covers/')) {
      assert.match(url, /opp-selected-[a-f0-9]{12}\.png$/);
      assert.equal(options.headers['Content-Type'], 'image/png');
      return new Response('{}', { status: 200 });
    }
    assert.fail(`Unexpected request: ${url}`);
  });
  const url = await generateOpportunityCover({ ...row, evidence: [{ source_url: 'https://source.test/old-image' }] }, { forceGenerate: true });
  assert.match(url, /opp-selected-[a-f0-9]{12}\.png$/);
  assert.ok(requests.some(url => url.includes('/images/generations')));
  assert.ok(requests.every(url => !url.includes('source.test')));
});
