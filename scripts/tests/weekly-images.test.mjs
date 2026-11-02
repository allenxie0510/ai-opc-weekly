import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWeeklyCover, backfillWeeklyImages, rasterType } from '../lib/weekly-images.mjs';

const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(5000)]);

test('copies verified source bytes and retains attribution to the matching source page', async () => {
  const refs = [{url:'https://example.com/missing'}, {url:'https://example.com/article'}];
  let stored = 0;
  const result = await fetchWeeklyCover(refs, {
    findImage: async ([ref], {accept}) => ref.source_url.endsWith('missing') ? null : await accept('https://cdn.example.com/photo') && 'https://cdn.example.com/photo',
    request: async () => new Response(png, {headers:{'content-type':'image/png'}}),
    store: async image => { stored++; assert.deepEqual(image.bytes,png); assert.equal(image.ext,'png'); return 'https://storage.example.com/verified.png'; },
  });
  assert.deepEqual(result, {image_url:'https://storage.example.com/verified.png',image_source_url:refs[1].url});
  assert.equal(stored,1);
});

test('rejects HTML disguised as image and an oversized download before upload', async () => {
  for (const response of [new Response('<html>'+'.'.repeat(6000), {headers:{'content-type':'image/png'}}), new Response(png,{headers:{'content-length':String(9*1024*1024)}})]) {
    assert.equal(await fetchWeeklyCover([{url:'https://example.com/article'}], {
      findImage: async (_refs,{accept}) => await accept('https://cdn.example.com/image') && 'https://cdn.example.com/image',
      request: async () => response, store: async () => assert.fail('invalid images must never be persisted'),
    }), null);
  }
  assert.equal(rasterType(Buffer.from('<svg></svg>')),null);
});

test('backfill preserves existing covers, only patches missing rows, and selects the first covered article', async () => {
  const existing = {id:'first',image_url:'https://storage.example.com/existing.png',rank:1};
  const missing = {id:'second',title:'Second',refs:[{url:'https://example.com/new'}],rank:2};
  const writes=[];
  const result=await backfillWeeklyImages('2026-w45', {
    db: async (path,opts) => {
      if(opts) { writes.push({path,body:JSON.parse(opts.body)}); return [{...missing,...JSON.parse(opts.body)}]; }
      if(path.startsWith('/weekly_issues?'))return [{id:'issue',cover_image:''}];
      return [existing,missing];
    },
    findCover: async refs => {assert.deepEqual(refs,missing.refs);return {image_url:'https://storage.example.com/new.png',image_source_url:refs[0].url};},
  });
  assert.equal(result.saved,1);
  assert.equal(writes.length,2);
  assert.match(writes[0].path,/id=eq.second&or=\(image_url.is.null,image_url.eq.\)/);
  assert.equal(writes[1].body.cover_image,existing.image_url);
});

test('no usable source image keeps the article and issue unchanged', async () => {
  const result=await backfillWeeklyImages('2026-w45', {
    db: async (path,opts) => {assert.equal(opts,undefined);return path.startsWith('/weekly_issues?')?[{id:'issue',cover_image:''}]:[{id:'item',title:'No image',refs:[]}];},
    findCover: async () => null,
  });
  assert.equal(result.saved,0);assert.equal(result.unavailable,1);
});
