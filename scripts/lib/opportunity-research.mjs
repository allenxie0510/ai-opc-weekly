import { createHash } from 'node:crypto';
import { readPublicUrl, extractSourceText } from './weekly-source-reader.mjs';
import { publicSourceUrl } from '../../lib/editorial-policy.mjs';
import { sourceTier } from '../../lib/evidence-policy.mjs';

// Discovery guidance, not a quality whitelist or proof of willingness to pay.
export const CHINA_SOURCE_GUIDE = [
  ['工信部', 'miit.gov.cn', '中小企业具体业务场景；政策、征集通知只作背景'],
  ['中国信通院', 'caict.ac.cn', '行业研究与采用条件；宏观数据不证明个体付费'],
  ['国家统计局', 'stats.gov.cn', '行业统计背景，不据此外推一人公司收入'],
  ['阿里云百炼', 'help.aliyun.com/zh/model-studio/', '官方能力、计费和地域条件，不证明客户需求'],
  ['腾讯云', 'cloud.tencent.com/document/', '官方能力、计费及交付限制'],
  ['飞书开放平台', 'open.feishu.cn/document/', '中国企业工作流集成、权限及交付条件'],
  ['V2EX / w2solo', 'v2ex.com / w2solo.com', '客户问题与创始人线索，自述不等于独立核实'],
];
const CONTEXT_HOSTS = ['miit.gov.cn', 'caict.ac.cn', 'stats.gov.cn', 'gov.cn'];
const hostMatches = (host, root) => host === root || host.endsWith(`.${root}`);
export function contextOnly(url) {
  try { return CONTEXT_HOSTS.some(root => hostMatches(new URL(url).hostname, root)); } catch { return true; }
}
function canonical(value) {
  if (!publicSourceUrl(value)) return '';
  const url = new URL(value); url.hash = '';
  return url.href;
}

// Fetch first. The model can only select quotes actually present in this snapshot.
export async function collectOpportunitySources(candidates, { read = readPublicUrl } = {}) {
  const sources = [], failures = [], seen = new Set();
  for (const candidate of candidates.slice(0, 14)) {
    const url = canonical(String(candidate.url || ''));
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const result = await read(url);
      if (!/html|text/i.test(result.type)) throw new Error('unreadable-format');
      const finalUrl = canonical(result.url);
      if (!finalUrl) throw new Error('invalid-final-url');
      if (new URL(url).pathname !== '/' && new URL(finalUrl).pathname === '/') throw new Error('detail-redirected-to-home');
      if (sources.some(s => s.url === finalUrl)) continue;
      const text = extractSourceText(result.body);
      if (text.length < 200 || /just a moment|verify you are human|access denied|captcha/i.test(text.slice(0, 500))) throw new Error('insufficient-readable-text');
      const contentHash = createHash('sha256').update(text).digest('hex');
      if (sources.some(s => s.content_sha256 === contentHash)) continue;
      const quotes = {};
      // Overlapping excerpts preserve exact case, punctuation and original language.
      const chars = Array.from(text);
      for (let start = 0; start < Math.min(chars.length, 10000); start += 140) {
        const quote = chars.slice(start, start + 200).join('');
        if (quote.length >= 12) quotes[`Q${Object.keys(quotes).length + 1}`] = quote;
      }
      sources.push({ id: `S${sources.length + 1}`, url: finalUrl,
        title: String(candidate.title || new URL(finalUrl).hostname).slice(0, 150),
        accessed_at: new Date().toISOString(), content_sha256: contentHash,
        context_only: contextOnly(finalUrl), quotes });
    } catch (error) { failures.push({ url, reason: error.message }); }
    if (sources.length >= 8) break;
  }
  return { sources, failures };
}

export function resolveOpportunityEvidence(raw, sources) {
  const evidence = [], seen = new Set();
  for (const item of (Array.isArray(raw) ? raw : []).slice(0, 6)) {
    const source = sources.find(s => s.id === item.source_id);
    const quote = source && Object.hasOwn(source.quotes, item.quote_id) ? source.quotes[item.quote_id] : '';
    if (!quote || !String(item.claim || '').trim() || !String(item.relevance_note || '').trim()) continue;
    const key = `${source.url}|${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({ claim: String(item.claim).slice(0, 200), source_name: source.title,
      source_url: source.url, quote, tier: sourceTier(source.url),
      role: source.context_only ? 'background' : ['direct', 'background', 'counter'].includes(item.role) ? item.role : 'background',
      relevance_note: String(item.relevance_note).slice(0, 300), quote_verified_at: source.accessed_at,
      content_sha256: source.content_sha256 });
  }
  return evidence;
}

export function opportunityQualityIssues(opp, evidence) {
  const issues = [];
  if (evidence.length < 3 || new Set(evidence.map(e => e.source_url)).size < 2 || !evidence.some(e => e.role === 'direct')) issues.push('needs-evidence: 至少3条不同原文摘录、2个页面和1条直接证据');
  for (const key of ['title','thesis','why_now','customer','pain','who_pays','business_model','mvp_wedge','first_10_customers','bear_case']) {
    if (typeof opp[key] !== 'string' || !opp[key].trim()) issues.push(`missing-${key}`);
  }
  const plan = opp.validation_plan || {};
  if (!Array.isArray(plan.steps) || plan.steps.filter(s => typeof s === 'string' && s.trim()).length < 2 || !plan.success_threshold || !plan.kill_condition) issues.push('missing-validation-plan');
  if (!['china', 'overseas', 'cross-border', 'unknown'].includes(plan.target_market) || !plan.china_applicability || !plan.solo_delivery || !plan.unknowns) issues.push('missing-local-feasibility');
  return issues;
}

export function resolveCaseRevenue(c, sources) {
  const source = sources.find(s => s.id === c.revenue_source_id);
  const quote = source && Object.hasOwn(source.quotes, c.revenue_quote_id) ? source.quotes[c.revenue_quote_id] : '';
  // Model estimates are not disclosed revenue; unsupported numbers are removed.
  const numbers = String(c.mrr || '').match(/\d[\d,.]*/g) || [];
  if (c.revenue_type !== 'founder_disclosed' || !quote || !/\bmrr\b|monthly (?:recurring )?revenue|月(?:度)?(?:营收|收入)|每月(?:收入|营收)/i.test(quote) || !numbers.length || !numbers.every(n => quote.includes(n))) {
    return { mrr: '未披露', revenue_type: 'undisclosed', revenue_source_url: '', claim_quote: '' };
  }
  return { mrr: String(c.mrr).slice(0, 60), revenue_type: 'founder_disclosed', revenue_source_url: source.url, claim_quote: quote };
}
