const DEFAULT_TIMEOUT_MS = 10_000;

const PRODUCT_TERM_STOPLIST = new Set([
  'AI', 'OPC', 'MRR', 'SaaS', 'API', 'MVP', 'The', 'And', 'For',
]);

function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

export function normalizePageText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function extractProductTerms(title) {
  return (String(title || '').match(/[A-Za-z][A-Za-z0-9.-]{2,}/g) || [])
    .filter(term => !PRODUCT_TERM_STOPLIST.has(term))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

export function isSuspiciousSourceUrl(value) {
  try {
    const url = new URL(value);
    const text = `${url.hostname}${url.pathname}`.toLowerCase();
    return /(?:^|[._\-/])(example|placeholder|dummy|fake|test)(?:[._\-/]|$)/.test(text)
      || /1234567|7654321|(?:\d)\1{6,}/.test(text);
  } catch {
    return true;
  }
}

/**
 * Weekly source validation deliberately fails closed:
 * - DNS/timeout/TLS failures are invalid, not "probably blocked".
 * - a specific article that redirects to a site's homepage is invalid.
 * - the product name and optional evidence quote must occur in the body.
 */
export async function validateSourceUrl(value, options = {}) {
  const {
    expectedTerms = [],
    quote = '',
    fetchImpl = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  let requested;
  try {
    requested = new URL(value);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (!['http:', 'https:'].includes(requested.protocol)) {
    return { ok: false, reason: 'invalid-protocol' };
  }
  if (isSuspiciousSourceUrl(value)) {
    return { ok: false, reason: 'suspicious-placeholder-url' };
  }

  let response;
  try {
    response = await fetchImpl(requested.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI-OPC-SourceVerifier/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'network-error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, reason: `http-${response.status}` };
  }

  let finalUrl;
  try {
    finalUrl = new URL(response.url || requested.toString());
  } catch {
    return { ok: false, reason: 'invalid-final-url' };
  }

  if (normalizeHost(finalUrl.hostname) !== normalizeHost(requested.hostname)) {
    return { ok: false, reason: 'cross-domain-redirect', finalUrl: finalUrl.toString() };
  }
  if (requested.pathname !== '/' && finalUrl.pathname === '/') {
    return { ok: false, reason: 'detail-redirected-to-home', finalUrl: finalUrl.toString() };
  }

  let body;
  try {
    body = await response.text();
  } catch (error) {
    return {
      ok: false,
      reason: 'body-read-error',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  if (body.length < 200) {
    return { ok: false, reason: 'empty-or-thin-body', finalUrl: finalUrl.toString() };
  }

  const pageText = normalizePageText(body);
  const terms = expectedTerms.map(normalizePageText).filter(Boolean);
  if (terms.length > 0 && !terms.some(term => pageText.includes(term))) {
    return { ok: false, reason: 'product-name-not-found', finalUrl: finalUrl.toString() };
  }
  if (quote && !pageText.includes(normalizePageText(quote))) {
    return { ok: false, reason: 'claim-quote-not-found', finalUrl: finalUrl.toString() };
  }

  return { ok: true, reason: 'verified', finalUrl: finalUrl.toString(), pageText };
}

