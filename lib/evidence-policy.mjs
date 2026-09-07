/** Source coverage is not a finding about semantic support or market validation. */
export function sourceTier(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'D'; }
  const tiers = {
    'github.com': 'S', 'openai.com': 'S', 'anthropic.com': 'S', 'huggingface.co': 'S',
    'ycombinator.com': 'A', 'revenuecat.com': 'A', 'acquire.com': 'A', 'carta.com': 'A', 'dealroom.co': 'A',
    'techcrunch.com': 'B', 'theverge.com': 'B', 'reuters.com': 'B', 'bloomberg.com': 'B', 'ft.com': 'B', '36kr.com': 'B',
    'news.ycombinator.com': 'C', 'indiehackers.com': 'C', 'producthunt.com': 'C', 'reddit.com': 'C', 'x.com': 'C',
  };
  // Exact host wins, so news.ycombinator.com stays community tier C.
  if (Object.hasOwn(tiers, host)) return tiers[host];
  return Object.entries(tiers).find(([domain]) => host.endsWith(`.${domain}`))?.[1] || 'D';
}

export function sourceCoverageGrade(evidence) {
  const sources = (Array.isArray(evidence) ? evidence : []).filter((item) => item.role !== 'background' && item.role !== 'counter');
  if (!sources.length) return 'D';
  const ranks = { S: 0, A: 0, B: 1, C: 2, D: 3 };
  const weakest = Math.max(...sources.map((item) => ranks[sourceTier(item.source_url)]));
  const hosts = new Set(sources.map((item) => {
    try {
      const host = new URL(item.source_url).hostname.toLowerCase().replace(/^www\./, '');
      // Group known publishers' subdomains; two sections of one site are not independent sources.
      const publisher = ['github.com', 'openai.com', 'anthropic.com', 'huggingface.co', 'ycombinator.com', 'revenuecat.com', 'acquire.com', 'carta.com', 'dealroom.co', 'techcrunch.com', 'theverge.com', 'reuters.com', 'bloomberg.com', 'ft.com', '36kr.com', 'indiehackers.com', 'producthunt.com', 'reddit.com', 'x.com'];
      return publisher.find((domain) => host === domain || host.endsWith(`.${domain}`)) || host;
    } catch { return ''; }
  }));
  // One publisher is never corroboration, even when it supplies several URLs.
  return ['A', 'B', 'C', 'D'][Math.max(weakest, hosts.size < 2 ? 2 : 0)];
}
