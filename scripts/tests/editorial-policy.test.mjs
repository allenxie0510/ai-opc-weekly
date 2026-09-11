import test from 'node:test';
import assert from 'node:assert/strict';
import { inferOperatingMarket, canUseMaterial, candidateMix, validateEditorialBrief, publishableBrief, BUSINESS_LABELS } from '../../lib/editorial-policy.mjs';
import { validateResearchIntake } from '../../lib/research-intake.mjs';
import { assessCandidate, selectCandidateMaterials, filterRadarItems } from '../lib/radar-policy.mjs';

// Synthetic test-only examples, never ingested or presented as real businesses.
const excerpt = '面向国内商家的商品图设计服务，AI 生成商品背景图，设计师审核并按订单交付。作者自述完成首批客户交付，但收入没有公开。';
const material = { title: '测试项目：商品图设计', source_name: 'w2solo', source_url: 'https://example.com/design', snippet: excerpt };
const source = quote => ({ answer: quote, basis: 'source', quote });
function brief() { return { operating_market: 'domestic', market_quote: '面向国内商家的商品图设计服务', business_form: 'design', answers: {
  payer: { answer: '潜在付费对象为需要商品图的商家', basis: 'inference', quote: '' },
  problem: source('面向国内商家的商品图设计服务'),
  ai_role: source('AI 生成商品背景图'),
  solo_delivery: { answer: '一人可先测试，但需要人工审图与订单管理', basis: 'inference', quote: '' },
  evidence: source('作者自述完成首批客户交付'),
  risk: { answer: '需核查商品图版权、生成质量与实际交付成本', basis: 'inference', quote: '' },
} }; }

test('经营地区不是语言、域名、国籍或平台词；不把计划当现状', () => {
  for (const text of ['中文介绍一个 AI 产品', '中国团队开发工具', '支持中文、微信和支付宝', '我用 ChatGPT 为客户交付', '如果面向国内商家，可以赚钱', '并非面向国内商家', '面向国内商家，同时面向美国客户']) assert.equal(inferOperatingMarket(text), 'unknown', text);
  assert.equal(inferOperatingMarket('面向国内商家的AI设计服务'), 'domestic');
  assert.equal(inferOperatingMarket('中国团队开发，面向美国卖家提供AI客服'), 'china-outbound');
  assert.equal(inferOperatingMarket('An AI service for customers in the US'), 'overseas');
});

test('六问必须有来源支撑；收入未知可保留，引用存在不等于事实审计', () => {
  const checked = validateEditorialBrief(brief(), material);
  assert.equal(checked.ok, true);
  assert.equal(checked.brief.evidence_grade, 'C');
  assert.equal(publishableBrief(checked.brief), true);
  assert.equal(validateEditorialBrief(brief(), { ...material, editor_verified_at: new Date().toISOString() }).brief.evidence_grade, 'B');
  const raw = brief(); raw.answers.ai_role.quote = '已实现完全无人自动交付';
  assert.equal(validateEditorialBrief(raw, material).ok, false);
  const noAI = brief(); noAI.answers.ai_role = { answer: '可能用了 AI', basis: 'inference', quote: '' };
  assert.equal(validateEditorialBrief(noAI, material).reason, 'insufficient-evidence-ai_role');
  const noRisk = brief(); delete noRisk.answers.risk;
  assert.equal(validateEditorialBrief(noRisk, material).ok, false);
  assert.equal(validateEditorialBrief({ ...brief(), operating_market: 'china-outbound' }, material).ok, false);
});

test('付费对象短称与坦白未披露不能被当成字段缺失；发布端采用同一标准', () => {
  for (const answer of ['商家', '开发者', '创作者', '未披露']) {
    const raw = brief(); raw.answers.payer = { answer, basis: answer === '未披露' ? 'unknown' : 'inference', quote: '' };
    raw.answers.solo_delivery = { answer: '未披露', basis: 'unknown', quote: '' };
    const checked = validateEditorialBrief(raw, material);
    assert.equal(checked.ok, true, answer);
    assert.equal(publishableBrief(checked.brief), true);
  }
  const raw = brief(); raw.answers.payer.answer = '';
  assert.equal(validateEditorialBrief(raw, material).ok, false);
});

test('付费社群在入库预筛、候选、六问和发布门槛均不可作公共证据', () => {
  for (const url of ['https://scys.com/articleDetail/xq_topic/123', 'https://wx.zsxq.com/group/init', 'https://scys.com./post']) {
    const privateMaterial = { ...material, source_url: url, source_access: 'private' };
    assert.equal(canUseMaterial(privateMaterial), false);
    assert.equal(assessCandidate(privateMaterial).eligible, false);
    assert.equal(selectCandidateMaterials([privateMaterial]).length, 0);
    assert.equal(validateEditorialBrief(brief(), privateMaterial).ok, false);
  }
  assert.equal(canUseMaterial({ ...material, source_access: 'authorized' }), false);
  assert.equal(canUseMaterial({ ...material, source_access: 'authorized', permission_verified: true }), true);
  assert.equal(publishableBrief(undefined), false);
});

function rows(name, n, domestic) { return Array.from({ length: n }, (_, i) => ({ ...material, source_name: name, source_url: `https://example.com/${name}/${i}`, snippet: domestic ? excerpt : 'Freelancers use AI design templates to deliver customer orders.' })); }
test('候选约半数国内，不依赖输入顺序，也不为数量收低质故事', () => {
  const pool = [...rows('w2solo', 20, true), ...rows('V2EX 分享创造', 20, true), ...rows('Product Hunt', 20, false), ...rows('Show HN', 20, false), ...rows('BetaList AI', 20, false)];
  const selected = selectCandidateMaterials(pool.reverse(), [], new Set(), 54, { domesticBalance: true });
  assert.equal(selected.length, 54);
  assert.equal(candidateMix(selected).domestic_share, 0.5);
  const deficient = selectCandidateMaterials([...rows('w2solo', 1, true), ...rows('Product Hunt', 20, false)], [], new Set(), 54, { domesticBalance: true });
  assert.ok(candidateMix(deficient).shortfall > 0);
  assert.equal(candidateMix(deficient).counts.domestic, 1);
  assert.equal(assessCandidate({ ...material, title: '一夜爆红，辞职创业', snippet: 'AI太强了，请支持我' }).eligible, false);
});

test('设计、内容、电商、知识产品、小企业服务不强制塞成软件', () => {
  for (const form of ['software', 'design', 'content', 'ecommerce', 'knowledge', 'business-service']) {
    assert.ok(BUSINESS_LABELS[form]);
    assert.equal(validateEditorialBrief({ ...brief(), business_form: form }, material).ok, true);
  }
});

test('国内配额不能绕过逐条六问及OPC硬门槛', () => {
  const raw = { title: material.title, source_url: material.source_url, summary: '商品图设计服务', editor_note: '先测试一个小品类', evidence_quote: 'AI 生成商品背景图',
    opc_value: { kind: 'delivery', audience_quote: '面向国内商家的商品图设计服务', workflow_quote: '设计师审核并按订单交付', next_action: '找一个真实商家测试样图交付和修改次数', limitation: '收入未披露，交付成本及版权需要核实' },
    fit: { audience_relevance: 5, actionability: 4, evidence_strength: 4, solo_feasibility: 4, transferability: 4 } };
  assert.equal(filterRadarItems([raw], [material], { requireEditorialBrief: true }).accepted.length, 0);
  assert.equal(filterRadarItems([{ ...raw, editorial_brief: brief() }], [material], { requireEditorialBrief: true }).accepted.length, 1);
});

test('研究入口：线索不携带付费正文；只有管理员确认的独立证据进入写稿', () => {
  const base = { title: '测试设计项目', lead_url: 'https://scys.com/topic/123', research_question: '是否有公开客户场景？', rights_basis: 'public-source' };
  assert.equal(validateResearchIntake(base).status, 'lead');
  assert.throws(() => validateResearchIntake({ ...base, excerpt: '付费内容' }));
  assert.throws(() => validateResearchIntake({ ...base, source_url: base.lead_url, excerpt, confirm_verified: true }));
  const verified = { ...base, source_url: material.source_url, excerpt, confirm_verified: true };
  assert.equal(validateResearchIntake(verified).status, 'verified');
  assert.throws(() => validateResearchIntake({ ...verified, rights_basis: 'author-permission' }));
  assert.equal(validateResearchIntake({ ...verified, rights_basis: 'author-permission', permission_note: '作者某某于2026年9月10日授权引用指定事实；凭证保存在管理员内部文档' }).status, 'verified');
});
