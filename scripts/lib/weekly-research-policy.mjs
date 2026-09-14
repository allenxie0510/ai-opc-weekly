import { canonicalSourceUrl, productIdentity } from './weekly-policy.mjs';
import { canUseMaterial } from '../../lib/editorial-policy.mjs';

export const WEEKLY_TARGET = 6;
export const WEEKLY_MINIMUM = 5;
export const WEEKLY_SOURCE_LIMIT = 2;
export const WEEKLY_FEEDS = [
  { name: 'w2solo', url: 'https://w2solo.com/topics/feed', lane: 'founder' },
  { name: 'V2EX 分享创造', url: 'https://www.v2ex.com/feed/create.xml', lane: 'founder' },
  { name: 'BetaList AI', url: 'https://betalist.com/topics/artificial-intelligence/feed', lane: 'launch' },
  { name: 'Product Hunt', url: 'https://www.producthunt.com/feed', lane: 'launch' },
  { name: 'RevenueCat', url: 'https://www.revenuecat.com/rss.xml', lane: 'business' },
  { name: 'IH Podcast', url: 'https://feeds.transistor.fm/the-indie-hackers-podcast', lane: 'business' },
  { name: 'n8n workflows', url: 'https://blog.n8n.io/rss/', lane: 'delivery' },
];
// Maintained research leads: read current primary evidence, never label these as new launches.
export const WEEKLY_PRIMARY_CASES = [
 {title:'Twinly Lab · AI 咨询与知识服务',source_url:'https://twinlylab.com/'},
 {title:'Interior AI · 室内设计与虚拟布置',source_url:'https://interiorai.com/'},
 {title:'DocsBot · AI 客服与知识交付',source_url:'https://docsbot.ai/'},
 {title:'Guidde · AI 视频文档与客户培训',source_url:'https://www.guidde.com/'},
 {title:'SiteGPT · AI 客服经营案例',source_url:'https://sitegpt.ai/'},
 {title:'HeadshotPro · AI 职业头像交付',source_url:'https://www.headshotpro.com/'},
 {title:'TypingMind · AI 工作台产品',source_url:'https://www.typingmind.com/'},
 {title:'Photo AI · 创始人与 AI 摄影产品',source_url:'https://photoai.com/faq/who-created-photo-ai-meet-pieter-levels-the-founder-5465077'},
];
const AI = /\b(ai|llm|gpt|agent|automation)\b|人工智能|智能体|大模型|自动化/i;
const BUSINESS = /customer|client|revenue|pricing|paying|subscription|business|design|marketing|workflow|invoice|sell|sales|用户|客户|营收|付费|定价|订单|交付|商家|设计|内容|电商|获客/i;
const CONTEXT = /TechCrunch|The Verge|a16z|GitHub Trending|X\/@(OpenAI|claudeai|Google)/i;
export function candidateRank(row, now = Date.now()) {
  const text = `${row.title || ''} ${row.snippet || ''}`;
  const age = (now - Date.parse(row.published_at || row.fetched_at || '')) / 86400000;
  if (!canUseMaterial(row) || !Number.isFinite(age) || age < -1 || age > 90 || CONTEXT.test(row.source_name || '')) return -1;
  if (!AI.test(text) && !BUSINESS.test(text)) return -1; // Short feeds are leads; verify both in the full research pass.
  // Geography is not a quota. Depth and business evidence outrank launch popularity.
  return (age <= 30 ? 30 : 10) + Math.min(20, String(row.snippet || '').length / 80)
    + (/^官方经营页：/.test(row.source_name || '') ? 30 : 0)
    + (/RevenueCat|IH Podcast|编辑核实/.test(row.source_name || '') ? 20 : 0)
    + (/pricing|revenue|paying|subscription|客户|定价|营收|付费|订单/i.test(text) ? 20 : 0);
}
export function selectWeeklyCandidates(rows, used = new Set(), now = Date.now(), limit = 60) {
  const unique = new Map();
  const seen = new Set([...used].map(canonicalSourceUrl));
  for (const row of rows) {
    const url = canonicalSourceUrl(row.source_url);
    if (!url || seen.has(url) || candidateRank(row, now) < 0) continue;
    const old = unique.get(url);
    if (!old || String(row.snippet || '').length > String(old.snippet || '').length) unique.set(url, row);
  }
  const groups = new Map();
  for (const row of [...unique.values()].sort((a,b)=>candidateRank(b,now)-candidateRank(a,now))) {
    const name = row.source_name || new URL(row.source_url).hostname;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  const result = [];
  while (result.length < limit && [...groups.values()].some(g=>g.length)) {
    for (const group of groups.values()) if (group.length && result.length < limit) result.push(group.shift());
  }
  return result;
}
export const SCORE_WEIGHTS = { customer: 20, business: 20, solo: 20, evidence: 25, learning: 15 };
export function weeklyScore(dimensions) {
  if (!dimensions || Object.keys(SCORE_WEIGHTS).some(k=>!Number.isInteger(dimensions[k]) || dimensions[k]<0 || dimensions[k]>5)) throw new Error('invalid-score');
  return Object.entries(SCORE_WEIGHTS).reduce((n,[k,w])=>n+dimensions[k]*w/5,0);
}
export function portfolioAllows(item, selected) {
  const identity = productIdentity(item.title);
  const host = new URL(item.refs[0].url).hostname.replace(/^www\./,'');
  return !!identity && !selected.some(x=>productIdentity(x.title)===identity)
    && selected.filter(x=>new URL(x.refs[0].url).hostname.replace(/^www\./,'')===host).length < WEEKLY_SOURCE_LIMIT
    && selected.filter(x=>x.category===item.category).length < 3;
}
