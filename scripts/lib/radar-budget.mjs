import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { assessCandidate, preScore, selectCandidateMaterials } from './radar-policy.mjs';
import { canonicalSourceUrl } from './feed-parser.mjs';

export const RADAR_BUDGET = Object.freeze({ intake: 24, model: 12, perRun: 3, perDay: 6, pending: 12 });
export const LEAN_SOURCES = { w2solo: 6, 'V2EX 分享创造': 6, '少数派': 3, 'Product Hunt': 6, 'Show HN': 3, 'BetaList AI': 3 };
const STATE_PATH = '.cache/editorial-ingestion/review-v4.json';
const POLICY = 'lean-opc-v4';

export function reviewCapacity({ pending = 0, today = 0 } = {}) {
  return Math.max(0, Math.min(RADAR_BUDGET.perRun, RADAR_BUDGET.pending - pending, RADAR_BUDGET.perDay - today));
}
export function beijingDayStart(now = Date.now()) {
  return new Date(`${new Date(now + 8 * 3600000).toISOString().slice(0, 10)}T00:00:00+08:00`).toISOString();
}
export function materialKey(row) {
  return createHash('sha256').update(JSON.stringify([POLICY, canonicalSourceUrl(row.source_url), row.title || '', row.snippet || ''])).digest('hex');
}
export function loadReviewState() {
  try { const s = JSON.parse(readFileSync(STATE_PATH, 'utf8')); return s.version === POLICY && s.reviewed && typeof s.reviewed === 'object' ? s : { version: POLICY, reviewed: {} }; }
  catch { return { version: POLICY, reviewed: {} }; }
}
export function recentlyReviewed(row, state, now = Date.now()) {
  const time = Number(state.reviewed?.[materialKey(row)]);
  return Number.isFinite(time) && time > now - 7 * 86400000 && time <= now;
}
export function saveReviewed(materials, state, now = Date.now()) {
  const reviewed = Object.fromEntries(Object.entries(state.reviewed || {}).filter(([, time]) => Number(time) > now - 7 * 86400000));
  for (const row of materials) reviewed[materialKey(row)] = now;
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  // Only content hashes + timestamps; no article body, credentials or private leads.
  writeFileSync(STATE_PATH, JSON.stringify({ version: POLICY, reviewed }));
}
export function leanEligible(row, now = Date.now()) {
  const check = assessCandidate(row, now);
  return check.eligible && check.utility >= 40; // both a concrete workflow and audience, not just "AI launch"
}
export function selectIntake(rows, seen = new Set(), now = Date.now()) {
  const groups = new Map();
  for (const row of rows) {
    if (!leanEligible(row, now) || !LEAN_SOURCES[row.source_name]) continue;
    if (!groups.has(row.source_name)) groups.set(row.source_name, []);
    groups.get(row.source_name).push(row);
  }
  const capped = [...groups].flatMap(([name, group]) => group.sort((a, b) => preScore(b, now) - preScore(a, now)).slice(0, LEAN_SOURCES[name]));
  return selectCandidateMaterials(capped, [], seen, RADAR_BUDGET.intake, { domesticBalance: true, now });
}

/** Count from the database before network/LLM work. Failure must not mean zero. */
export async function readReviewLoad(sb, now = Date.now()) {
  const countRows = async query => {
    let count = 0;
    for (;;) {
      const page = await sb(`${query}&limit=1000&offset=${count}`);
      if (!Array.isArray(page)) throw new Error('无法读取审核负荷；停止新增而不是把故障当空队列');
      count += page.length;
      if (page.length < 1000) return count;
      if (count > 20000) throw new Error('审核队列超出安全读取范围');
    }
  };
  const [pending, today] = await Promise.all([
    countRows('/radar_items?select=id&status=eq.draft&order=id.asc'),
    countRows(`/radar_items?select=id&created_at=gte.${encodeURIComponent(beijingDayStart(now))}&order=id.asc`),
  ]);
  return { pending, today, capacity: reviewCapacity({ pending, today }) };
}
