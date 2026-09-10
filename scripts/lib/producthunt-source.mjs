import { canonicalSourceUrl, parseRSS, stripHtml } from './feed-parser.mjs';

export const PH_FEED_URL = 'https://www.producthunt.com/feed';
const HOURS = 3600000;
const DAY = 24 * HOURS;
const ENDPOINT = 'https://api.producthunt.com/v2/api/graphql';
// Popular launches from each separate day, not one 36-hour winner-takes-all list.
// A token is optional; the official public feed is also consulted (no page scraping).
export async function fetchProductHunt({ token, fetchImpl = fetch, now = Date.now(), warn = console.warn, days = 4, perDay = 30, feedFallbackOnly = false } = {}) {
  days = Math.max(1, Math.min(4, Math.floor(Number(days) || 4)));
  perDay = Math.max(1, Math.min(30, Math.floor(Number(perDay) || 30)));
  const rows = new Map();
  const report = { apiDays: 0, feedCount: 0, warnings: [] };
  const warning = message => { report.warnings.push(message); warn(message); };
  if (token) {
    for (let day = 0; day < days; day++) {
      const after = new Date(now - (day + 1) * DAY).toISOString();
      const before = new Date(now - day * DAY).toISOString();
      const query = `query { posts(order: VOTES, postedAfter: "${after}", postedBefore: "${before}", first: ${perDay}) {
        edges { node { name tagline description url votesCount createdAt topics { edges { node { name } } } } }
      } }`;
      try {
        const response = await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'User-Agent': 'ai-opc-weekly-radar/2.0' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.errors || !Array.isArray(data.data?.posts?.edges)) throw new Error('GraphQL response invalid');
        report.apiDays++;
        for (const { node: p } of data.data.posts.edges) {
          const source_url = canonicalSourceUrl(p.url);
          if (!source_url || !p.name) continue;
          const topics = (p.topics?.edges || []).map(t => t.node.name).slice(0, 6).join('/');
          rows.set(source_url, { source_name: 'Product Hunt', source_url,
            title: `${p.name} — ${p.tagline || ''}`.slice(0, 200),
            snippet: `[PH ▲${Math.max(0, Number(p.votesCount) || 0)}] ${stripHtml(p.description || p.tagline)}${topics ? ` · ${topics}` : ''}`.slice(0, 1600),
            published_at: Number.isFinite(Date.parse(p.createdAt)) ? new Date(p.createdAt).toISOString() : null,
          });
        }
      } catch (error) {
        // Do not hammer a failing or rate-limited API. Try the official feed once.
        warning(`Product Hunt API: ${error.message}; remaining API windows skipped`);
        break;
      }
    }
  } else warning('Product Hunt: token missing; using official public feed (votes/history unavailable)');
  if (feedFallbackOnly && rows.size) return { items: [...rows.values()], report };
  try {
    const response = await fetchImpl(PH_FEED_URL, { headers: { 'User-Agent': 'ai-opc-weekly-radar/2.0', Accept: 'application/atom+xml,application/rss+xml' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const feedRows = parseRSS(await response.text());
    if (!feedRows.length) throw new Error('empty or invalid feed');
    for (const row of feedRows) {
      const date = Date.parse(row.published_at);
      if (!Number.isFinite(date) || date < now - 4 * DAY || date > now + HOURS) continue;
      report.feedCount++;
      if (!rows.has(row.source_url)) rows.set(row.source_url, { ...row, source_name: 'Product Hunt' });
    }
  } catch (error) { warning(`Product Hunt official feed: ${error.message}`); }
  if (!rows.size) throw new Error(`Product Hunt unavailable/empty; ${report.warnings.join('; ')}`);
  return { items: [...rows.values()], report };
}
