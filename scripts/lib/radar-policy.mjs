/**
 * OPC Radar candidate policy.
 *
 * Keep source selection and final acceptance deterministic. The LLM writes and
 * judges semantic fit, but it cannot make a context-heavy feed dominate the
 * prompt or publish an item that fails the OPC thresholds below.
 */

import { canonicalSourceUrl } from './feed-parser.mjs';
import { canUseMaterial, inferOperatingMarket, validateEditorialBrief } from '../../lib/editorial-policy.mjs';

const SOURCE_POLICIES = {
  'w2solo': { lane: 'founder', weight: 9, limit: 14 },
  'V2EX 分享创造': { lane: 'founder', weight: 8, limit: 14 },
  '编辑核实案例': { lane: 'founder', weight: 10, limit: 6 },
  'Show HN': { lane: 'founder', weight: 10, limit: 6 },
  'Product Hunt': { lane: 'founder', weight: 10, limit: 16 },
  'BetaList AI': { lane: 'founder', weight: 9, limit: 6 },
  'Reddit r/SideProject': { lane: 'founder', weight: 5, limit: 2 },
  'IH Podcast': { lane: 'founder', weight: 10, limit: 4 },
  RevenueCat: { lane: 'founder', weight: 10, limit: 4 },

  'GitHub Trending': { lane: 'enabler', weight: 7, limit: 4 },
  'Hacker News': { lane: 'enabler', weight: 6, limit: 4 },
  '少数派': { lane: 'enabler', weight: 5, limit: 3 },

  'YC RFS': { lane: 'context', weight: 7, limit: 2 },
  'BVP Atlas': { lane: 'context', weight: 5, limit: 2 },
  'TechCrunch AI': { lane: 'context', weight: 3, limit: 2 },
  TechCrunch: { lane: 'context', weight: 3, limit: 2 },
  'The Verge AI': { lane: 'context', weight: 2, limit: 2 },
  'AI + a16z': { lane: 'context', weight: 3, limit: 2 },
};

// These are creator/founder accounts already tracked by the project. They get
// founder-first treatment only for prompt sampling; the /x timeline is unchanged.
const FOUNDER_X_HANDLES = new Set([
  'levelsio', 'yihui_indie', 'thsottiaux', 'steipete', 'fonsmans',
  'ingi_erlingsson', 'soltwagner', 'shadcn', 'soren_iverson',
  'zarazhangrui',
]);

const LARGE_COMPANY_X_HANDLES = new Set([
  'openai', 'claudeai', 'googlelabs', 'bchesky', 'rauchg',
]);

const CONTEXT_NOISE_RE = /\b(funding|fundraise|valuation|series [a-z]|ceo|acquisition|acquires|merger|billion|trillion|model benchmark)\b|融资|估值|收购|并购|董事长|百亿|千亿/gi;

// These are recall heuristics, not proof of revenue or a model verdict. Launching,
// being solo, hours spent and votes alone never establish OPC business value.
const BUSINESS_WORKFLOW_RE = /\b(leads?|outreach|prospect\w*|follow[- ]?up|book(?:ing|s)?|invoic\w*|checkout|payments?|customer support|sales|clients?|business cards?|bio|crm|marketing|ecommerce|e-commerce|storefront|proposal\w*|landing page|conversion|onboarding|subscri\w*|deploy\w*|debug\w*|design\w*|templates?|workflows?|automat\w*|translat\w*|schedul\w*|reports?|content creation|video edit\w*|pricing|revenue|mrr)\b|获客|线索|预约|名片|客户|报价|订单|收款|客服|交付|营销|转化|素材|设计|自动化|工作流|翻译|定价|收入|复购|留存/i;
const AUDIENCE_RE = /\b(founders?|freelancers?|creators?|consultants?|agencies|agency|solopreneurs?|small business\w*|small teams?|developers?|designers?|merchants?|sellers?|clients?|customers?|salespeople|your (?:(?:static|personal) )?(?:work|business|bio|profile))\b|个体|创业者|自由职业|创作者|咨询师|工作室|小团队|商家|开发者|设计师|客户/i;
const CASE_EVIDENCE_RE = /\b\d[\d,.]*\s*(?:paying customers|paid users|customers|clients|subscribers)\b|\b(?:mrr|revenue|profit|conversion|retention)\s*(?:of|:|to|is|at)?\s*[$€£¥]?\s*\d|[$€£¥]\s*\d[\d,.]*\s*(?:k\s*)?(?:mrr|revenue|profit)\b|\d+\s*(?:付费用户|客户)|(?:收入|盈利|转化率|留存率)\s*[:：为达至]?\s*[$¥￥]?\d/i;
const NARRATIVE_HOOK_RE = /\b(?:accidentally|by accident|forced to (?:launch|ship)|spent \d[\d,.]* (?:hours|days|months)|roast my|please (?:upvote|support)|went viral|you won't believe|quit my job|got fired)\b|误发|意外(?:上线|发布)|被迫上线|熬夜|一夜爆红|跪求|震惊|炸裂|辞职创业/i;
export const OPC_VALUE_KINDS = ['acquisition', 'delivery', 'operations', 'building', 'monetization', 'case-study'];
const DOMESTIC_WORKFLOW_RE = /选品|一件代发|店铺|商品图|电商|代运营|知识付费|知识产品|付费专栏|短视频制作|短视频配乐|广告配乐|字幕|人声分离|剪辑|课件|排版|财税|记账|合同审阅|企业服务|代码生成|代码调试|断点续传/;
const DOMESTIC_AUDIENCE_RE = /程序员|内容运营|独立音乐人|视频制作者|自媒体|店主|卖家|中小企业/;

export function assessCandidate(row = {}, now = Date.now()) {
  if (row.source_url && !canUseMaterial(row)) return { eligible: false, reason: 'source-not-cleared', utility: 0 };
  const title = String(row.title || '');
  const text = `${title} ${row.snippet || ''}`;
  const workflow = BUSINESS_WORKFLOW_RE.test(text) || DOMESTIC_WORKFLOW_RE.test(text);
  const audience = AUDIENCE_RE.test(text) || DOMESTIC_AUDIENCE_RE.test(text);
  const caseEvidence = CASE_EVIDENCE_RE.test(text);
  const date = Date.parse(row.published_at);
  if (Number.isFinite(date) && (date < now - 7 * 86400000 || date > now + 3600000)) return { eligible: false, reason: 'outside-signal-window', utility: 0 };
  if (NARRATIVE_HOOK_RE.test(title) && !(workflow && audience && caseEvidence)) return { eligible: false, reason: 'narrative-without-business-evidence', utility: 0 };
  if (['Reddit r/SideProject', 'w2solo', 'V2EX 分享创造'].includes(row.source_name) && !(workflow && audience)) return { eligible: false, reason: 'community-without-concrete-use-case', utility: 0 };
  return { eligible: true, reason: '', utility: (workflow ? 24 : 0) + (audience ? 16 : 0) + (workflow && caseEvidence ? 8 : 0) };
}

const LARGE_COMPANY_RE = /\b(OpenAI|Anthropic|Google|Meta|Microsoft|Apple|Amazon|ByteDance|TikTok|xAI|Tesla|Nvidia|Adobe|Salesforce|Oracle|IBM|Vercel|Cursor|SpaceX|Alibaba|Baidu|Tencent|Calendly|Rippling|Midjourney|Runway|Mistral)\b|字节跳动|阿里巴巴|百度|腾讯|微软|谷歌|苹果|亚马逊|英伟达/i;

const LANE_LIMITS = { founder: 32, enabler: 16, context: 6 };

function xHandle(sourceName = '') {
  const match = sourceName.match(/^X\/@([^\s/]+)/i);
  return match ? match[1].toLowerCase() : '';
}

export function sourcePolicy(sourceName = '') {
  if (SOURCE_POLICIES[sourceName]) return SOURCE_POLICIES[sourceName];
  const handle = xHandle(sourceName);
  if (handle && FOUNDER_X_HANDLES.has(handle)) return { lane: 'founder', weight: 8, limit: 3 };
  if (handle && LARGE_COMPANY_X_HANDLES.has(handle)) return { lane: 'context', weight: 3, limit: 1 };
  if (handle) return { lane: 'enabler', weight: 5, limit: 2 };
  return { lane: 'enabler', weight: 4, limit: 3 };
}

function matchCount(text, regex) {
  return [...text.matchAll(regex)].length;
}

export function preScore(row, now = Date.now()) {
  const policy = sourcePolicy(row.source_name);
  const text = `${row.title || ''} ${row.snippet || ''}`;
  // A bounded popularity tie-breaker, never a substitute for business utility.
  const votes = row.source_name === 'Product Hunt' ? Number(String(row.snippet || '').match(/^\[PH ▲(\d+)\]/)?.[1] || 0) : 0;
  return policy.weight * 3 + assessCandidate(row, now).utility + Math.min(8, Math.log2(1 + votes))
    - (policy.lane === 'context' ? Math.min(4, matchCount(text, CONTEXT_NOISE_RE)) * 5 : 0);
}

function timestampOf(row) {
  return Date.parse(row.published_at || row.fetched_at || 0) || 0;
}

function roundRobin(groups, maximum) {
  const result = [];
  let madeProgress = true;
  while (result.length < maximum && madeProgress) {
    madeProgress = false;
    for (const group of groups) {
      if (result.length >= maximum) break;
      const next = group.items.shift();
      if (next) {
        result.push(next);
        madeProgress = true;
      }
    }
  }
  return result;
}

/**
 * Build a diverse, founder-first material set for the LLM prompt.
 * `tweets` are normalized here so both source families share the same policy.
 */
export function selectCandidateMaterials(candidates = [], tweets = [], seenUrls = new Set(), maxTotal = 54, options = {}) {
  const normalizedTweets = tweets.map(t => ({
    source_name: `X/@${t.author_username}`,
    source_url: t.url,
    title: (t.content || '').slice(0, 160),
    snippet: (t.content || '').slice(0, 1200),
    published_at: t.published_at,
    fetched_at: t.created_at,
  }));

  const unique = new Map();
  const seen = new Set([...seenUrls].map(canonicalSourceUrl));
  for (const row of [...candidates, ...normalizedTweets]) {
    const url = canonicalSourceUrl(row?.source_url);
    const assessment = assessCandidate(row, options.now ?? Date.now());
    if (!url || seen.has(url) || unique.has(url) || !assessment.eligible) continue;
    const policy = sourcePolicy(row.source_name);
    unique.set(url, { ...row, policy, pre_score: preScore(row, options.now ?? Date.now()) });
  }

  const byLane = { founder: new Map(), enabler: new Map(), context: new Map() };
  for (const row of unique.values()) {
    const groups = byLane[row.policy.lane];
    if (!groups.has(row.source_name)) groups.set(row.source_name, []);
    groups.get(row.source_name).push(row);
  }

  if (options.domesticBalance) {
    // Reserve half of the actual pool, never a publication quota. Select before
    // per-source trimming so high-volume foreign feeds cannot hide domestic rows.
    const ranked = [...unique.values()].sort((a, b) => b.pre_score - a.pre_score || timestampOf(b) - timestampOf(a));
    const result = [], sourceCounts = new Map(), lanes = { founder: 0, enabler: 0, context: 0 };
    const add = row => {
      if (result.length >= maxTotal || result.includes(row)) return false;
      if ((sourceCounts.get(row.source_name) || 0) >= row.policy.limit || lanes[row.policy.lane] >= (row.policy.lane === 'founder' ? maxTotal : LANE_LIMITS[row.policy.lane])) return false;
      result.push(row); sourceCounts.set(row.source_name, (sourceCounts.get(row.source_name) || 0) + 1); lanes[row.policy.lane]++; return true;
    };
    const domestic = ranked.filter(r => inferOperatingMarket(`${r.title} ${r.snippet}`) === 'domestic');
    const rest = ranked.filter(r => !domestic.includes(r));
    // Do not backfill absent domestic evidence with dozens more overseas rows.
    for (const r of domestic) { if (result.length >= Math.ceil(maxTotal / 2)) break; add(r); }
    const domesticCount = result.length;
    const otherBudget = Math.floor(maxTotal / 2);
    // Unknown geography is not overseas. Interleave sources so English PH rows
    // cannot occupy every unknown slot and starve Chinese public-feed leads.
    const restGroups = new Map();
    for (const r of rest) {
      if (!restGroups.has(r.source_name)) restGroups.set(r.source_name, []);
      restGroups.get(r.source_name).push(r);
    }
    for (const r of roundRobin([...restGroups.values()].map(items => ({ items })), rest.length)) {
      if (result.length - domesticCount >= otherBudget) break;
      add(r);
    }
    return result;
  }

  const selectedByLane = {};
  for (const lane of ['founder', 'enabler', 'context']) {
    const groups = [...byLane[lane].entries()].map(([sourceName, rows]) => {
      const policy = sourcePolicy(sourceName);
      rows.sort((a, b) => b.pre_score - a.pre_score || timestampOf(b) - timestampOf(a));
      return { sourceName, weight: policy.weight, items: rows.slice(0, policy.limit) };
    }).sort((a, b) => b.weight - a.weight || a.sourceName.localeCompare(b.sourceName));
    selectedByLane[lane] = roundRobin(groups, Math.min(LANE_LIMITS[lane], maxTotal));
  }

  // Founder evidence goes first and gets most of the budget. Context is always
  // last and capped at six, preventing big-media volume from crowding the prompt.
  return [
    ...selectedByLane.founder,
    ...selectedByLane.enabler,
    ...selectedByLane.context,
  ].slice(0, maxTotal);
}

function clampFit(value) {
  return Math.max(0, Math.min(5, Number(value) || 0));
}

export function computeOpcScore(fit = {}) {
  const audience = clampFit(fit.audience_relevance);
  const actionability = clampFit(fit.actionability);
  const evidence = clampFit(fit.evidence_strength);
  const solo = clampFit(fit.solo_feasibility);
  const transfer = clampFit(fit.transferability);
  return Math.round((audience * 30 + actionability * 20 + evidence * 15 + solo * 20 + transfer * 15) / 5);
}

function isLargeCompanySignal(raw, material) {
  // A founder using an OpenAI/Google API is not itself a large-company story.
  // Check the subject/title, and only inspect full copy for context-media lanes.
  return raw.company_scale === 'large-company'
    || LARGE_COMPANY_RE.test(material.title || '')
    || (sourcePolicy(material.source_name).lane === 'context' && LARGE_COMPANY_RE.test(material.snippet || ''));
}

function normalizedEvidence(text = '') {
  return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Final gate after the LLM response. It verifies provenance, applies minimum
 * OPC-fit dimensions, caps any single source, and allows at most one genuinely
 * transferable large-company signal.
 */
export function filterRadarItems(rawItems = [], materials = [], options = {}) {
  const maxItems = options.maxItems ?? 6;
  const minimumScore = options.minimumScore ?? 70;
  const materialByUrl = new Map(materials.map(row => [row.source_url, row]));
  const accepted = [];
  const rejected = [];
  const sourceCounts = new Map();
  const acceptedUrls = new Set();
  let largeCompanyCount = 0;
  let buildingCount = 0;

  const ranked = rawItems.map(raw => {
    const material = materialByUrl.get(raw?.source_url);
    return { raw, material, score: computeOpcScore(raw?.fit) };
  }).sort((a, b) => b.score - a.score);

  for (const entry of ranked) {
    const { raw, material, score } = entry;
    let reason = '';
    if (!material) reason = 'source_url-not-in-materials';
    else if (!assessCandidate(material, options.now ?? Date.now()).eligible) reason = assessCandidate(material, options.now ?? Date.now()).reason;
    else if (!raw.title || !raw.summary || !raw.editor_note) reason = 'missing-copy';
    else if (NARRATIVE_HOOK_RE.test(raw.title)) reason = 'clickbait-headline';
    else {
      const quote = normalizedEvidence(raw.evidence_quote);
      const sourceText = normalizedEvidence(`${material.title || ''} ${material.snippet || ''}`);
      if (quote.length < 8 || !sourceText.includes(quote)) reason = 'evidence-quote-not-in-material';
    }
    if (!reason) {
      const value = raw.opc_value || {};
      const sourceText = normalizedEvidence(`${material.title || ''} ${material.snippet || ''}`);
      const audience = normalizedEvidence(value.audience_quote);
      const workflow = normalizedEvidence(value.workflow_quote);
      if (!OPC_VALUE_KINDS.includes(value.kind) || String(value.next_action || '').trim().length < 12 || String(value.limitation || '').trim().length < 8) reason = 'missing-concrete-opc-value';
      else if (audience.length < 8 || workflow.length < 8 || !sourceText.includes(audience) || !sourceText.includes(workflow)) reason = 'opc-value-quotes-not-in-material';
      // Exact quotes establish provenance; business fit is read in full context.
      // Requiring isolated excerpts to contain a fixed English noun caused valid
      // products to fail even when their complete description explained the job.
      else if (!BUSINESS_WORKFLOW_RE.test(sourceText) && !DOMESTIC_WORKFLOW_RE.test(sourceText)) reason = 'opc-value-not-business-specific';
      else if (value.kind === 'case-study' && !CASE_EVIDENCE_RE.test(sourceText)) reason = 'case-without-business-evidence';
    }
    if (!reason) {
      if (options.requireEditorialBrief) {
        const checked = validateEditorialBrief(raw.editorial_brief, material);
        if (!checked.ok) reason = checked.reason;
        else raw.editorial_brief = checked.brief;
      }
    }
    if (!reason) {
      const fit = raw.fit || {};
      const minimumsMet = clampFit(fit.audience_relevance) >= 4
        && clampFit(fit.actionability) >= 3
        && clampFit(fit.evidence_strength) >= 3
        && clampFit(fit.solo_feasibility) >= 3
        && score >= minimumScore;
      if (!minimumsMet) reason = 'opc-fit-below-threshold';
    }

    const largeCompany = material ? isLargeCompanySignal(raw, material) : false;
    if (!reason && largeCompany) {
      const migrationPlay = String(raw.migration_play || '').trim();
      if (clampFit(raw.fit?.transferability) < 4 || migrationPlay.length < 12) {
        reason = 'large-company-without-concrete-transfer';
      } else if (largeCompanyCount >= 1) {
        reason = 'large-company-cap';
      }
    }

    const sourceName = material?.source_name || '';
    const sourceCap = sourceName === 'Product Hunt' ? 3 : sourceName === 'Reddit r/SideProject' || sourceName.startsWith('X/@') ? 1 : 2;
    if (!reason && acceptedUrls.has(canonicalSourceUrl(raw.source_url))) reason = 'duplicate-source-url';
    if (!reason && (sourceCounts.get(sourceName) || 0) >= sourceCap) reason = 'source-cap';
    if (!reason && raw.opc_value.kind === 'building' && buildingCount >= 2) reason = 'building-tools-cap';
    if (!reason && accepted.length >= maxItems) reason = 'daily-cap';

    if (reason) {
      rejected.push({ source_url: raw?.source_url || '', reason, score });
      continue;
    }

    accepted.push({ ...raw, source_name: sourceName, score, _large_company: largeCompany });
    acceptedUrls.add(canonicalSourceUrl(raw.source_url));
    sourceCounts.set(sourceName, (sourceCounts.get(sourceName) || 0) + 1);
    if (largeCompany) largeCompanyCount++;
    if (raw.opc_value.kind === 'building') buildingCount++;
  }

  return { accepted, rejected };
}

export const RADAR_POLICY_CONSTANTS = {
  laneLimits: LANE_LIMITS,
  sourcePolicies: SOURCE_POLICIES,
};
