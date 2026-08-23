import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeOpcScore,
  filterRadarItems,
  selectCandidateMaterials,
  sourcePolicy,
} from '../lib/radar-policy.mjs';

function rows(source_name, count, title = 'AI product launch') {
  return Array.from({ length: count }, (_, i) => ({
    source_name,
    source_url: `https://example.com/${encodeURIComponent(source_name)}/${i}`,
    title: `${title} ${i}`,
    snippet: 'Bootstrapped founder launched with pricing and first customers',
    published_at: new Date(Date.UTC(2026, 7, 23, 0, 0, count - i)).toISOString(),
  }));
}

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
