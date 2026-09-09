import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRSS, stripHtml } from '../lib/feed-parser.mjs';
import { fetchProductHunt, PH_FEED_URL } from '../lib/producthunt-source.mjs';

const now = Date.parse('2026-09-09T08:00:00Z');
const feed = `<feed><entry><title>Knockin&apos;</title><link rel="self" href="https://api.producthunt.com/items/1"/><link rel="alternate" href="https://www.producthunt.com/products/knockin?utm_source=feed"/><published>2026-09-07T05:02:45Z</published><content type="html">&lt;p&gt;Turns your static bio into an AI business card that replies&lt;/p&gt;</content></entry></feed>`;

test('官方 Atom 解析保留正文、优先 alternate、清理 HTML 和追踪参数', () => {
  const rows = parseRSS(feed);
  assert.equal(rows[0].source_url, 'https://www.producthunt.com/products/knockin');
  assert.equal(rows[0].title, "Knockin'");
  assert.equal(rows[0].snippet, 'Turns your static bio into an AI business card that replies');
  assert.equal(stripHtml('&lt;p&gt;Freelancers &amp; clients&lt;/p&gt;'), 'Freelancers & clients');
  assert.equal(parseRSS('<rss><item><title>Use case</title><link>https://product.example/item</link><description><![CDATA[<p>' + 'Business workflow '.repeat(35) + '</p>]]></description></item></rss>')[0].snippet.length > 300, true);
  assert.equal(parseRSS('<html>Access denied</html>').length, 0);
});

test('无 token 仍接官方 Feed；缺失票数不造零值或排名', async () => {
  const requests = [];
  const r = await fetchProductHunt({ now, warn: () => {}, fetchImpl: async url => { requests.push(url); return new Response(feed); } });
  assert.deepEqual(requests, [PH_FEED_URL]);
  assert.equal(r.items.length, 1);
  assert.equal(r.report.apiDays, 0);
  assert.equal(r.items[0].snippet.includes('▲'), false);
});

test('分四天查询，并包含 description；合并官方 Feed 不覆盖 API 的丰富介绍', async () => {
  const queries = [];
  const description = 'An AI business card for freelancers. It answers questions from clients and lets them book time. ' + 'More detail. '.repeat(35);
  const r = await fetchProductHunt({ token: 'unit-test-token', now, warn: () => {}, fetchImpl: async (url, init) => {
    if (url === PH_FEED_URL) return new Response(feed);
    queries.push(JSON.parse(init.body).query);
    return Response.json({ data: { posts: { edges: [{ node: { name: "Knockin'", tagline: 'AI business card', description, url: 'https://www.producthunt.com/products/knockin?ref=api', votesCount: 196, createdAt: '2026-09-07T05:02:45Z' } }] } } });
  } });
  assert.equal(queries.length, 4);
  assert.match(queries[0], /postedAfter: "2026-09-08T08:00:00.000Z"/);
  assert.match(queries[3], /postedAfter: "2026-09-05T08:00:00.000Z"/);
  assert.match(queries[0], /postedBefore:.*description/s);
  assert.equal(r.items.length, 1);
  assert.ok(r.items[0].snippet.includes(description.trim()));
  assert.match(r.items[0].snippet, /^\[PH ▲196\]/);
});

test('限流或无效 GraphQL 立即停止 API，官方源单次兜底；双源失效显式报错', async () => {
  for (const status of [429, 401, 200]) {
    let apiCalls = 0;
    const r = await fetchProductHunt({ token: 'test', now, warn: () => {}, fetchImpl: async url => {
      if (url === PH_FEED_URL) return new Response(feed);
      apiCalls++;
      return Response.json({ errors: [{ message: 'API unavailable' }] }, { status });
    } });
    assert.equal(apiCalls, 1);
    assert.equal(r.items.length, 1);
  }
  await assert.rejects(fetchProductHunt({ now, warn: () => {}, fetchImpl: async () => new Response('Access denied', { status: 403 }) }), /unavailable/);
  await assert.rejects(fetchProductHunt({ now: now + 10 * 86400000, warn: () => {}, fetchImpl: async () => new Response(feed) }), /empty/);
});
