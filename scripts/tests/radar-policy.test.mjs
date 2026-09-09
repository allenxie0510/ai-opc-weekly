import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeOpcScore,
  filterRadarItems,
  selectCandidateMaterials,
  sourcePolicy,
  assessCandidate,
  preScore,
} from '../lib/radar-policy.mjs';

function rows(source_name, count, title = 'AI product launch') {
  return Array.from({ length: count }, (_, i) => ({
    source_name,
    source_url: `https://example.com/${encodeURIComponent(source_name)}/${i}`,
    title: `${title} ${i}`,
    snippet: 'Bootstrapped founder launched with pricing and first customers',
    published_at: new Date(Date.now() - i * 1000).toISOString(),
  }));
}

const businessValue = { kind: 'monetization', audience_quote: 'Bootstrapped founder', workflow_quote: 'pricing and first customers', next_action: '访谈目标客户并验证该定价对应的付费意愿', limitation: '素材仅为作者自述，收入与实际效果未核实' };

test('candidate sampling is founder-first and caps context volume', () => {
  const candidates = [
    ...rows('TechCrunch AI', 30, 'OpenAI funding and acquisition'),
    ...rows('The Verge AI', 20, 'Google model benchmark'),
    ...rows('Show HN', 12),
    ...rows('Product Hunt', 12),
    ...rows('BetaList AI', 12),
    ...rows('Reddit r/SideProject', 12),
    ...rows('Hacker News', 12),
  ];

  const selected = selectCandidateMaterials(candidates, [], new Set(), 54);
  const laneCounts = selected.reduce((acc, row) => {
    acc[row.policy.lane] = (acc[row.policy.lane] || 0) + 1;
    return acc;
  }, {});
  const sourceCounts = selected.reduce((acc, row) => {
    acc[row.source_name] = (acc[row.source_name] || 0) + 1;
    return acc;
  }, {});

  assert.ok(laneCounts.founder >= 20);
  assert.ok(laneCounts.context <= 6);
  assert.ok(sourceCounts['TechCrunch AI'] <= 2);
  assert.ok(sourceCounts['The Verge AI'] <= 2);
  assert.equal(selected[0].policy.lane, 'founder');
});

test('tracked X founders and large-company accounts enter different lanes', () => {
  assert.equal(sourcePolicy('X/@levelsio').lane, 'founder');
  assert.equal(sourcePolicy('X/@OpenAI').lane, 'context');
  assert.equal(sourcePolicy('X/@some_creator').lane, 'enabler');
});

test('OPC score is computed from fixed five-dimension weights', () => {
  assert.equal(computeOpcScore({
    audience_relevance: 5,
    actionability: 4,
    evidence_strength: 3,
    solo_feasibility: 4,
    transferability: 5,
  }), 86);
});

test('final gate verifies provenance, thresholds, source cap and big-company cap', () => {
  const materials = [
    ...rows('Show HN', 3),
    ...rows('TechCrunch AI', 3, 'OpenAI launches a new API'),
  ];
  const strongFit = {
    audience_relevance: 5,
    actionability: 4,
    evidence_strength: 4,
    solo_feasibility: 4,
    transferability: 4,
  };
  const raw = [
    ...materials.slice(0, 3).map((m, i) => ({
      title: `Founder case ${i}`,
      summary: 'A concrete founder case with customers and pricing.',
      editor_note: '我会先验证这个明确的付费痛点。',
      source_url: m.source_url,
      evidence_quote: 'Bootstrapped founder launched',
      company_scale: 'solo',
      migration_play: '',
      fit: strongFit,
      opc_value: businessValue,
    })),
    ...materials.slice(3).map((m, i) => ({
      title: `Big company ${i}`,
      summary: 'A platform change with a concrete workflow impact.',
      editor_note: '我会限定一个目标行业做验证。',
      source_url: m.source_url,
      evidence_quote: 'Bootstrapped founder launched',
      company_scale: 'large-company',
      migration_play: '面向牙科诊所做垂直版本，30天访谈10位诊所经营者并收取3个订金。',
      fit: strongFit,
      opc_value: businessValue,
    })),
    {
      title: 'Invented source',
      summary: 'Not in the prompt.',
      editor_note: '不应通过。',
      source_url: 'https://invented.example/item',
      evidence_quote: 'not in materials',
      company_scale: 'solo',
      fit: strongFit,
    },
    {
      title: 'Weak fit',
      summary: 'Generic AI news.',
      editor_note: '不应通过。',
      source_url: materials[0].source_url,
      evidence_quote: 'Bootstrapped founder launched',
      company_scale: 'solo',
      fit: { ...strongFit, audience_relevance: 2 },
      opc_value: businessValue,
    },
  ];

  const result = filterRadarItems(raw, materials, { maxItems: 6, minimumScore: 70 });
  const acceptedBySource = result.accepted.reduce((acc, item) => {
    acc[item.source_name] = (acc[item.source_name] || 0) + 1;
    return acc;
  }, {});

  assert.equal(acceptedBySource['Show HN'], 2);
  assert.equal(acceptedBySource['TechCrunch AI'], 1);
  assert.ok(result.rejected.some(r => r.reason === 'source-cap'));
  assert.ok(result.rejected.some(r => r.reason === 'large-company-cap'));
  assert.ok(result.rejected.some(r => r.reason === 'source_url-not-in-materials'));
  assert.ok(result.rejected.some(r => r.reason === 'opc-fit-below-threshold'));
});

test('误发上线、耗时卖惨与求支持不能靠满分进入草稿；没有封杀有经营证据的社区案例', () => {
  for (const title of ['I spent 260 hours building an AI tool and accidentally launched it', 'AI 工具误发后被迫上线', 'Please upvote my new AI tool']) {
    const m = { source_name: 'Reddit r/SideProject', source_url: 'https://reddit.com/r/SideProject/comments/story', title, snippet: 'I built it as a solo founder. Please support the launch.' };
    assert.equal(assessCandidate(m).eligible, false);
    assert.equal(selectCandidateMaterials([m]).length, 0);
    assert.equal(filterRadarItems([{ title, summary: 'story', editor_note: 'opinion', source_url: m.source_url, evidence_quote: m.title, fit: { audience_relevance: 5, actionability: 5, evidence_strength: 5, solo_feasibility: 5, transferability: 5 }, opc_value: businessValue }], [m]).accepted.length, 0);
  }
  assert.equal(assessCandidate({ source_name: 'Reddit r/SideProject', title: 'I accidentally launched an invoicing tool', snippet: 'Freelancers send invoices to clients. 12 paying customers pay $9/month.' }).eligible, true);
});

test('具体产品用途优先于泛词堆叠和纯票数，Knockin 类工具无需编造收入或团队规模', () => {
  const product = { source_name: 'Product Hunt', source_url: 'https://www.producthunt.com/products/knockin', title: "Knockin'", snippet: 'Turns your static bio into an AI business card that replies' };
  const hype = { ...product, source_url: 'https://www.producthunt.com/products/hype', title: 'AI launch', snippet: '[PH ▲99999] Solo indie founder launched AI AI AI users users users' };
  assert.ok(preScore(product) > preScore(hype));
  assert.equal(selectCandidateMaterials([...rows('Product Hunt', 15, 'AI launch'), product]).some(r => r.source_url === product.source_url), true);
  const raw = { source_url: product.source_url, title: 'Knockin：能回复访客的 AI 名片', summary: '产品将个人简介转成可对话名片，可用作个人业务介绍入口。', editor_note: '建议先测试常见业务询问，效果待验证。', evidence_quote: product.snippet, company_scale: 'unknown', fit: { audience_relevance: 5, actionability: 4, evidence_strength: 3, solo_feasibility: 4, transferability: 4 }, opc_value: { kind: 'acquisition', audience_quote: 'your static bio', workflow_quote: 'an AI business card that replies', next_action: '将个人业务简介配置成名片，测试常见客户询问', limitation: '公开素材未披露付费转化、实际效果和成本' } };
  assert.equal(filterRadarItems([raw], [product]).accepted.length, 1);
  assert.equal(filterRadarItems([{ ...raw, opc_value: { ...raw.opc_value, workflow_quote: 'Already generated 100 customers' } }], [product]).rejected[0].reason, 'opc-value-quotes-not-in-material');
  assert.equal(filterRadarItems([{ ...raw, title: 'AI 工具误发后被迫上线' }], [product]).rejected[0].reason, 'clickbait-headline');
  assert.equal(filterRadarItems([raw, raw], [product]).accepted.length, 1);
});

test('来源长尾不超过时效窗，URL 跟踪参数不能绕过历史排重', () => {
  const m = rows('Product Hunt', 1)[0];
  assert.equal(selectCandidateMaterials([{ ...m, source_url: m.source_url + '?utm_source=feed' }], [], new Set([m.source_url])).length, 0);
  assert.equal(assessCandidate({ ...m, published_at: new Date(Date.now() - 8 * 86400000).toISOString() }).reason, 'outside-signal-window');
  assert.equal(assessCandidate({ ...m, published_at: new Date(Date.now() + 2 * 86400000).toISOString() }).eligible, false);
});

test('final gate rejects a real URL with a fabricated evidence quote', () => {
  const material = rows('BetaList AI', 1)[0];
  const result = filterRadarItems([{
    title: 'Real URL, invented claim',
    summary: 'The URL is real but the claim is not grounded.',
    editor_note: '不应通过。',
    source_url: material.source_url,
    evidence_quote: 'made one million dollars overnight',
    company_scale: 'small-team',
    fit: {
      audience_relevance: 5,
      actionability: 5,
      evidence_strength: 5,
      solo_feasibility: 5,
      transferability: 5,
    },
  }], [material]);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, 'evidence-quote-not-in-material');
});
