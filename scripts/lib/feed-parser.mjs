// Shared RSS/Atom adapter. Keep useful product context rather than just the hook.
export function decodeEntities(value = '') {
  return String(value).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/&amp;/g, '&');
}
export function stripHtml(value = '') {
  return decodeEntities(String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
export function canonicalSourceUrl(value) {
  try {
    const url = new URL(decodeEntities(value));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|ref$|referrer$)/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}
export function parseRSS(xml) {
  const rows = [];
  for (const match of String(xml).matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const [, kind, block] = match;
    const text = tag => block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '';
    const title = stripHtml(text('title'));
    let link = text('link').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    if (kind.toLowerCase() === 'entry') {
      const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => ({
        href: m[1].match(/\bhref=['"]([^'"]+)['"]/i)?.[1],
        rel: m[1].match(/\brel=['"]([^'"]+)['"]/i)?.[1] || 'alternate',
      }));
      link = links.find(l => l.rel === 'alternate')?.href || '';
    }
    const source_url = canonicalSourceUrl(link);
    if (!title || !source_url) continue;
    const snippet = [text('content:encoded'), text('content'), text('description'), text('summary')]
      .map(stripHtml).sort((a, b) => b.length - a.length)[0].slice(0, 1600);
    const date = Date.parse(text('published') || text('pubDate') || text('dc:date') || text('updated'));
    rows.push({ title, source_url, snippet, published_at: Number.isFinite(date) ? new Date(date).toISOString() : null });
  }
  return rows;
}
