// Quote IDs select exact per-source text. Unknown IDs never become fabricated
// quotes; the normal editorial and OPC gates still run after resolution.
export function quoteIndex(material) {
  const text = `${material.title || ''} ${material.snippet || ''}`.replace(/\s+/g, ' ').trim();
  const quotes = {};
  for (let start = 0; start < text.length; start += 60) {
    // Do not split an emoji/supplementary character into invalid JSONB Unicode.
    const from = /[\uDC00-\uDFFF]/.test(text[start]) ? start + 1 : start;
    let end = Math.min(from + 80, text.length);
    if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    const quote = text.slice(from, end);
    if (quote.length >= 8) quotes[`q${Object.keys(quotes).length + 1}`] = quote;
  }
  return quotes;
}

export function resolveQuoteIds(item, material) {
  const quotes = quoteIndex(material);
  const resolve = id => typeof id === 'string' && Object.hasOwn(quotes, id) ? quotes[id] : '';
  const raw = item.editorial_brief || {};
  return { ...item, evidence_quote: resolve(item.evidence_quote_id),
    opc_value: { ...item.opc_value, audience_quote: resolve(item.opc_value?.audience_quote_id), workflow_quote: resolve(item.opc_value?.workflow_quote_id) },
    editorial_brief: { ...raw, market_quote: resolve(raw.market_quote_id),
      answers: Object.fromEntries(Object.entries(raw.answers || {}).map(([key, field]) => [key, { ...field, quote: field.basis === 'source' ? resolve(field.quote_id) : '' }])),
    },
  };
}
