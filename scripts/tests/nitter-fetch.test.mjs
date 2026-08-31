import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import test from 'node:test';

import {
  candidatesFor,
  extractMediaPreviews,
  fetchFeedCurl,
  parseNitterTimelineHtml,
  parseRSSFeed,
  parseStatusSources,
} from '../../lib/nitter-fetch.mjs';

const account = { username: 'levelsio' };

test('RSS 解析只接受有真实 ID 和时间的推文', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item>
      <title>Built &amp; shipped today</title>
      <guid isPermaLink="false">2091041945162510436</guid>
      <pubDate>Sun, 24 Aug 2026 08:00:00 GMT</pubDate>
      <description><![CDATA[<img src="https://xcancel.com/pic/media%2Fabc.jpg">]]></description>
    </item>
    <item><title>没有时间的旧数据</title><guid>123</guid></item>
  </channel></rss>`;

  const tweets = parseRSSFeed(xml, account);
  assert.equal(tweets.length, 1);
  assert.equal(tweets[0].tweet_id, '2091041945162510436');
  assert.equal(tweets[0].published_at, '2026-08-24T08:00:00.000Z');
  assert.equal(tweets[0].content, 'Built & shipped today');
  assert.match(tweets[0].media_urls[0], /pbs\.twimg\.com/);
});

test('RSS 视频只保存静态 poster，不把 mp4 当图片', () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item>
      <title>Video demo</title>
      <guid>2091041945162510437</guid>
      <pubDate>Sun, 24 Aug 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[
        <video poster='/pic/amplify_video_thumb%2F2091041945162510437%2Fimg%2Fcover.jpg'></video>
      ]]></description>
      <media:content url='https://video.twimg.com/demo.mp4' type='video/mp4'/>
      <media:thumbnail url='/pic/amplify_video_thumb%2F2091041945162510437%2Fimg%2Fcover.jpg'/>
    </item>
  </channel></rss>`;

  const tweets = parseRSSFeed(xml, account, 'https://rss.xcancel.com/levelsio/rss');
  assert.equal(tweets.length, 1);
  assert.equal(tweets[0].media_urls.length, 1);
  assert.match(decodeURIComponent(tweets[0].media_urls[0]), /pbs\.twimg\.com\/amplify_video_thumb/);
  assert.doesNotMatch(tweets[0].media_urls[0], /\.mp4/);
});

test('媒体预览兼容单引号、相对地址并跳过头像', () => {
  const previews = extractMediaPreviews(`
    <img src='/pic/profile_images%2Favatar.jpg'>
    <img src='/pic/orig/media%2Fphoto.jpg'>
  `, 'https://rss.xcancel.com/user/rss');
  assert.equal(previews.length, 1);
  assert.match(decodeURIComponent(previews[0]), /pbs\.twimg\.com\/media\/photo\.jpg/);
});

test('RSS 不可用时可从 Nitter HTML 时间线提取真实推文', () => {
  const html = `<!doctype html><div class="timeline">
    <div class="timeline-item" data-username="levelsio">
      <a class="tweet-link" href="/levelsio/status/2091041945162510436#m"></a>
      <div class="tweet-body">
        <span class="tweet-date"><a href="/levelsio/status/2091041945162510436#m" title="Aug 24, 2026 · 8:00 AM UTC">now</a></span>
        <div class="tweet-content media-body" dir="auto">Built <a href="/x">a product</a><br>today</div>
        <div class="attachments"><img src="/pic/media%2Fabc.jpg"></div>
      </div>
    </div>
    <div class="timeline-item show-more"><a href="?cursor=x">Load more</a></div>
  </div>`;

  const tweets = parseNitterTimelineHtml(html, account, 'https://nitter.example/levelsio');
  assert.equal(tweets.length, 1);
  assert.equal(tweets[0].tweet_id, '2091041945162510436');
  assert.equal(tweets[0].content, 'Built a product\ntoday');
  assert.equal(tweets[0].published_at, '2026-08-24T08:00:00.000Z');
  assert.match(tweets[0].media_urls[0], /pbs\.twimg\.com/);
});

test('Nitter HTML 视频卡片提取 poster 作为静态截图', () => {
  const html = `<div class="timeline-item">
    <a class="tweet-link" href="/levelsio/status/2091041945162510438#m"></a>
    <span class="tweet-date"><a title="Aug 24, 2026 · 10:00 AM UTC">now</a></span>
    <div class="tweet-content">Video launch</div>
    <video poster="/pic/ext_tw_video_thumb%2F2091041945162510438%2Fpu%2Fimg%2Fstill.jpg"></video>
  </div>`;
  const tweets = parseNitterTimelineHtml(html, account, 'https://nitter.example/levelsio');
  assert.equal(tweets.length, 1);
  assert.match(decodeURIComponent(tweets[0].media_urls[0]), /pbs\.twimg\.com\/ext_tw_video_thumb/);
});

test('生产写入仅在抓到媒体时覆盖已有推文', () => {
  const script = readFileSync(new URL('../fetch-tweets.mjs', import.meta.url), 'utf8');
  const refresh = readFileSync(new URL('../../app/api/admin/refresh/route.ts', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../../.github/workflows/fetch-tweets.yml', import.meta.url), 'utf8');
  assert.match(script, /ignoreDuplicates: t\.media_urls\.length === 0/);
  assert.match(script, /SUPABASE_SERVICE_ROLE_KEY \|\| process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(refresh, /ignoreDuplicates: t\.media_urls\.length === 0/);
  assert.match(refresh, /createServerSupabase\(true\)/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
});

test('状态 API 只选健康公开 HTTPS 源，并优先 RSS', () => {
  const sources = parseStatusSources({ hosts: [
    { url: 'https://html.example', healthy: true, rss: false, points: 99 },
    { url: 'https://rss.example', healthy: true, rss: true, points: 50 },
    { url: 'https://down.example', healthy: false, rss: true, points: 100 },
    { url: 'http://unsafe.example', healthy: true, rss: true, points: 100 },
    { url: 'https://127.0.0.1', healthy: true, rss: true, points: 100 },
  ] });

  assert.deepEqual(sources.map((source) => source.baseUrl), [
    'https://rss.example',
    'https://html.example',
  ]);
});

test('候选源保留非 RSS.app 自定义兜底', () => {
  const sources = [{ name: 'free RSS', baseUrl: 'https://rss.example', kind: 'rss' }];
  const custom = candidatesFor({ username: 'a/b', rss_url: 'https://feed.example/a.xml' }, sources);
  assert.equal(custom[0].name, 'rss_url 自定义兜底');
  assert.equal(custom[1].url, 'https://rss.example/a%2Fb/rss');

  const paid = candidatesFor({ username: 'levelsio', rss_url: 'https://rss.app/feed/old' }, sources);
  assert.equal(paid.length, 1);
});

test('curl 会跟随 XCancel 同类 302 跳转并读取 RSS', async (t) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/feed' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    res.end('<rss><channel><item><title>real</title></item></channel></rss>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const { port } = server.address();
  const result = await fetchFeedCurl(`http://127.0.0.1:${port}/redirect`, 5);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.finalUrl, `http://127.0.0.1:${port}/feed`);
  assert.match(result.xml, /<item>/);
});
