import { getWeeklyIssues } from '@/lib/data';

export const revalidate = 300;
const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);

export async function GET() {
  const issues = await getWeeklyIssues();
  const items = issues.slice(0, 30).map((issue) => {
    const url = `https://www.aiopcnews.com/weekly/${encodeURIComponent(issue.slug)}`;
    const date = new Date(issue.published_at);
    return `<item><title>${escapeXml(issue.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${escapeXml(issue.summary || '')}</description>${Number.isFinite(date.getTime()) ? `<pubDate>${date.toUTCString()}</pubDate>` : ''}</item>`;
  }).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>AI OPC · 一人公司机会周报</title><link>https://www.aiopcnews.com</link><description>AI 应用机会、案例与验证思路，随已发布周报更新。</description><language>zh-cn</language><atom:link href="https://www.aiopcnews.com/feed.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
