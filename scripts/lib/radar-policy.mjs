/**
 * OPC Radar candidate policy.
 *
 * Keep source selection and final acceptance deterministic. The LLM writes and
 * judges semantic fit, but it cannot make a context-heavy feed dominate the
 * prompt or publish an item that fails the OPC thresholds below.
 */

const SOURCE_POLICIES = {
  'Show HN': { lane: 'founder', weight: 10, limit: 6 },
  'Product Hunt': { lane: 'founder', weight: 9, limit: 6 },
  'BetaList AI': { lane: 'founder', weight: 9, limit: 6 },
  'Reddit r/SideProject': { lane: 'founder', weight: 8, limit: 5 },
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

const POSITIVE_SIGNAL_RE = /\b(solo|indie|independent|bootstrapp?ed|side project|micro[- ]?saas|mrr|arr|revenue|profit(?:able)?|customers?|users?|pricing|subscription|launched|launching|built in|small team|founder|case study|acquired)\b|独立开发|一人公司|个人开发|小团队|副业|上线|发布|订阅|收入|盈利|用户|客户|定价|案例/gi;
const CONTEXT_NOISE_RE = /\b(funding|fundraise|valuation|series [a-z]|ceo|acquisition|acquires|merger|billion|trillion|model benchmark)\b|融资|估值|收购|并购|董事长|百亿|千亿/gi;

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

function preScore(row) {
  const policy = sourcePolicy(row.source_name);
  const text = `${row.title || ''} ${row.snippet || ''}`;
  return policy.weight * 10
    + Math.min(5, matchCount(text, POSITIVE_SIGNAL_RE)) * 4
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
export function selectCandidateMaterials(candidates = [], tweets = [], seenUrls = new Set(), maxTotal = 54) {
  const normalizedTweets = tweets.map(t => ({
    source_name: `X/@${t.author_username}`,
    source_url: t.url,
    title: (t.content || '').slice(0, 160),
    snippet: (t.content || '').slice(0, 300),
    published_at: t.published_at,
    fetched_at: t.created_at,
  }));

  const unique = new Map();
  for (const row of [...candidates, ...normalizedTweets]) {
    if (!row?.source_url || seenUrls.has(row.source_url) || unique.has(row.source_url)) continue;
    const policy = sourcePolicy(row.source_name);
    unique.set(row.source_url, { ...row, policy, pre_score: preScore(row) });
  }

  const byLane = { founder: new Map(), enabler: new Map(), context: new Map() };
  for (const row of unique.values()) {
    const groups = byLane[row.policy.lane];
    if (!groups.has(row.source_name)) groups.set(row.source_name, []);
    groups.get(row.source_name).push(row);
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
  // Deterministic name detection overrides an incorrect model scale label.
  return raw.company_scale === 'large-company'
    || LARGE_COMPANY_RE.test(`${material.title || ''} ${material.snippet || ''}`);
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
  let largeCompanyCount = 0;

  const ranked = rawItems.map(raw => {
    const material = materialByUrl.get(raw?.source_url);
    return { raw, material, score: computeOpcScore(raw?.fit) };
  }).sort((a, b) => b.score - a.score);

  for (const entry of ranked) {
    const { raw, material, score } = entry;
    let reason = '';
    if (!material) reason = 'source_url-not-in-materials';
    else if (!raw.title || !raw.summary || !raw.editor_note) reason = 'missing-copy';
    else {
      const quote = normalizedEvidence(raw.evidence_quote);
      const sourceText = normalizedEvidence(`${material.title || ''} ${material.snippet || ''}`);
      if (quote.length < 8 || !sourceText.includes(quote)) reason = 'evidence-quote-not-in-material';
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
    if (!reason && (sourceCounts.get(sourceName) || 0) >= 2) reason = 'source-cap';
    if (!reason && accepted.length >= maxItems) reason = 'daily-cap';

    if (reason) {
      rejected.push({ source_url: raw?.source_url || '', reason, score });
      continue;
    }

    accepted.push({ ...raw, source_name: sourceName, score, _large_company: largeCompany });
    sourceCounts.set(sourceName, (sourceCounts.get(sourceName) || 0) + 1);
    if (largeCompany) largeCompanyCount++;
  }

  return { accepted, rejected };
}

export const RADAR_POLICY_CONSTANTS = {
  laneLimits: LANE_LIMITS,
  sourcePolicies: SOURCE_POLICIES,
};
