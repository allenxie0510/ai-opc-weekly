import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { XMLParser } from 'fast-xml-parser';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import type { Article, Source, SourceRun } from './types';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
export function canonicalUrl(input: string, base?: string): string {
  const u = new URL(input, base);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80', '443'].includes(u.port))) throw new Error('Unsupported URL');
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString();
}
export function publicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
  }
  // Reject mapped/local IPv6; public global unicast only.
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip);
}
export async function fetchDocument(input: string, allowedHosts?: string[]) {
  let url = canonicalUrl(input);
  for (let redirects = 0; redirects <= 4; redirects++) {
    const u = new URL(url);
    if (allowedHosts && !allowedHosts.includes(u.hostname)) throw new Error(`Unapproved host migration: ${u.hostname}`);
    const addresses = await lookup(u.hostname, { all: true });
    if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private network URL blocked');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(18000), headers: { 'User-Agent': 'AIOPCNews/2.0 (+https://www.aiopcnews.com/about)', Accept: 'text/html,application/rss+xml,application/atom+xml,application/xml,text/plain' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirect without location');
      url = canonicalUrl(location, url); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    const contentType = response.headers.get('content-type') || '';
    if (!/html|xml|text\/plain|markdown/i.test(contentType)) { await response.body?.cancel(); throw new Error(`Unsupported content type: ${contentType}`); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty body');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 3_000_000) throw new Error('Body exceeds 3MB'); chunks.push(value); }
    } finally { await reader.cancel(); }
    return { url, text: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Too many redirects');
}
function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) return text((value as Record<string, unknown>)['#text']);
  return '';
}
function plain(value: string) { return clean(parseHTML(`<div>${value}</div>`).document.querySelector('div')?.textContent || ''); }
function date(value: unknown): string | null { const v = Date.parse(text(value)); return Number.isFinite(v) ? new Date(v).toISOString() : null; }
export interface Discovered { url: string; title: string; snippet: string; publishedAt: string | null; }
export function discover(source: Source, raw: string): Discovered[] {
  if (source.kind === 'page') return [{ url: source.url, title: source.name, snippet: '', publishedAt: null }];
  if (source.kind === 'index') {
    const { document } = parseHTML(raw); const found = new Map<string, Discovered>();
    for (const a of document.querySelectorAll('a[href]')) {
      try {
        const url = canonicalUrl(a.getAttribute('href')!, source.url); const u = new URL(url);
        const title = clean(a.textContent || '');
        if (source.allowedHosts.includes(u.hostname) && new RegExp(source.linkPattern!).test(u.pathname) && title.length >= 8) found.set(url, { url, title, snippet: '', publishedAt: null });
      } catch { /* Invalid links are not candidates. */ }
    }
    return [...found.values()].slice(0, 20);
  }
  const parsed = new XMLParser({ ignoreAttributes: false, processEntities: true }).parse(raw);
  const entries = parsed.rss?.channel?.item ?? parsed.feed?.entry ?? [];
  return (Array.isArray(entries) ? entries : [entries]).flatMap((item): Discovered[] => {
    const links = Array.isArray(item.link) ? item.link : [item.link];
    const link = links.find((l: Record<string, string> | string) => typeof l === 'string' || !l?.['@_rel'] || l['@_rel'] === 'alternate');
    try {
      const url = canonicalUrl(typeof link === 'object' ? link?.['@_href'] : text(link), source.url);
      const title = plain(text(item.title));
      if (!title || url === source.url) return [];
      return [{ url, title, snippet: plain(text(item.description ?? item.summary ?? item.content)).slice(0, 2000), publishedAt: date(item.pubDate ?? item.published ?? item['dc:date'] ?? item.updated) }];
    } catch { return []; }
  }).slice(0, 20);
}
export function extractArticle(source: Source, item: Discovered, raw: string, now = new Date()): Article {
  const { document } = parseHTML(raw);
  const metaDate = document.querySelector('meta[property="article:published_time"],meta[name="date"]')?.getAttribute('content') || document.querySelector('time[datetime]')?.getAttribute('datetime');
  const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  document.querySelectorAll('script,style,nav,footer,header,aside,noscript').forEach(n => n.remove());
  const parsed = new Readability(document as unknown as Document).parse();
  const fallback = document.querySelector('article,main,[role="main"]');
  const body = clean(parsed?.textContent || fallback?.textContent || '');
  const publishedAt = item.publishedAt || date(metaDate);
  const issues: string[] = [];
  if (body.length < 400) issues.push('正文不足，禁止生成深度判断');
  if (/^(just a moment|access denied|verify you are human)/i.test(body) || /enable javascript and cookies to continue/i.test(body)) issues.push('访问挑战页');
  if (publishedAt && Date.parse(publishedAt) > now.getTime() + 86400000) issues.push('发布时间异常');
  if (!publishedAt) issues.push('发布时间待核对');
  if (source.id === 'indiehackers' && !/transcript|逐字稿/i.test(body)) issues.push('播客简介不足以支持经营判断，需完整访谈');
  return { sourceId: source.id, url: canonicalUrl(item.url), title: metaTitle || item.title, snippet: item.snippet, publishedAt, body: body.slice(0, 60000), bodyHash: hash(body), fetchedAt: now.toISOString(), state: issues.some(i => i !== '发布时间待核对') ? 'blocked' : 'ready', issues };
}
export async function collect(source: Source, limit = 3): Promise<{ run: SourceRun; articles: Article[] }> {
  const start = Date.now(); const articles: Article[] = [];
  const run: SourceRun = { sourceId: source.id, checkedAt: new Date().toISOString(), state: 'error', discovered: 0, readable: 0, durationMs: 0, error: null, sampleUrls: [], latestPublishedAt: null };
  try {
    const index = await fetchDocument(source.url, source.allowedHosts);
    const items = discover({ ...source, url: index.url }, index.text);
    run.discovered = items.length; run.sampleUrls = items.slice(0, 3).map(i => i.url);
    run.latestPublishedAt = items.map(i => i.publishedAt).filter((d): d is string => !!d).sort().at(-1) || null;
    for (const item of items.slice(0, limit)) {
      try {
        const raw = source.kind === 'page' ? index : await fetchDocument(item.url, source.tier === 'official' ? source.allowedHosts : undefined);
        articles.push(extractArticle(source, { ...item, url: raw.url }, raw.text));
      } catch (e) {
        articles.push({ sourceId: source.id, ...item, body: '', bodyHash: hash(''), fetchedAt: new Date().toISOString(), state: 'blocked', issues: [String(e)] });
      }
    }
    run.readable = articles.filter(a => a.state === 'ready').length;
    run.state = !items.length ? 'empty' : articles.length && !run.readable ? 'error' : run.readable < articles.length ? 'partial' : 'healthy';
    if (['error', 'partial'].includes(run.state)) run.error = articles.filter(a => a.state === 'blocked').map(a => a.issues.join('; ')).join(' | ').slice(0, 1000);
  } catch (e) { run.error = String(e).slice(0, 1000); }
  run.durationMs = Date.now() - start;
  return { run, articles };
}
