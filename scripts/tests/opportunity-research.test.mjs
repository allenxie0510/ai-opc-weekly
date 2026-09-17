import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOpportunitySources, resolveOpportunityEvidence, opportunityQualityIssues, resolveCaseRevenue, contextOnly } from '../lib/opportunity-research.mjs';

const source = { id: 'S1', url: 'https://maker.com/pricing', title: 'Maker', accessed_at: '2026-09-17', content_sha256: 'abc', quotes: { Q1: 'Maker charges $20 per month for its customer support workspace.' }, context_only: false };
test('403, unreadable PDFs, challenge pages and homepage redirects never become evidence', async () => {
  const candidates = ['blocked','pdf','challenge','redirect'].map(s => ({ url: `https://maker.com/${s}` }));
  const result = await collectOpportunitySources(candidates, { read: async url => {
    if (url.endsWith('blocked')) throw new Error('source-http-403');
    if (url.endsWith('pdf')) return { url, type: 'application/pdf', body: 'x'.repeat(300) };
    if (url.endsWith('redirect')) return { url: 'https://maker.com/', type: 'text/html', body: 'x'.repeat(300) };
    return { url, type: 'text/html', body: 'Verify you are human ' + 'x'.repeat(300) };
  }});
  assert.equal(result.sources.length, 0); assert.equal(result.failures.length, 4);
});
test('source title cannot inject text into verified quotes; snapshots retain original text', async () => {
  const result = await collectOpportunitySources([{ url: source.url, title: 'Invented revenue $999M' }], { read: async url => ({ url, type: 'text/html', body: '<main>' + source.quotes.Q1.repeat(20) + '</main>' }) });
  assert.equal(result.sources.length, 1);
  assert.ok(Object.values(result.sources[0].quotes).every(q => !q.includes('Invented')));
  assert.equal(result.sources[0].content_sha256.length, 64);
});
test('fabricated IDs and repeated quotes are discarded; URLs and quotes cannot be overridden', () => {
  const item = { source_id: 'S1', quote_id: 'Q1', claim: 'Public subscription price', role: 'direct', relevance_note: 'Pricing only, no revenue claim', quote: 'Fake', source_url: 'https://fake.com' };
  const evidence = resolveOpportunityEvidence([item, item, {...item, quote_id: '__proto__'}, {...item, quote_id: 'Q99'}, {...item, source_id: 'S99'}], [source]);
  assert.equal(evidence.length, 1); assert.equal(evidence[0].quote, source.quotes.Q1); assert.equal(evidence[0].source_url, source.url);
});
test('authority and government context cannot masquerade as direct customer evidence', () => {
  assert.equal(contextOnly('https://www.miit.gov.cn/article'), true);
  assert.equal(contextOnly('https://miit.gov.cn.attacker.com/article'), false);
  const evidence = resolveOpportunityEvidence([{ source_id: 'S1', quote_id: 'Q1', claim: 'Demand', role: 'direct', relevance_note: 'Claimed demand' }], [{...source, context_only: true}]);
  assert.equal(evidence[0].role, 'background'); assert.ok(opportunityQualityIssues({}, evidence).some(s => s.startsWith('needs-evidence')));
});
test('revenue requires a source quote containing the stated number, estimates are suppressed', () => {
  const c = { mrr: '$5000/月', revenue_type: 'founder_disclosed', revenue_source_id: 'S1', revenue_quote_id: 'Q1' };
  assert.equal(resolveCaseRevenue(c, [source]).mrr, '未披露');
  assert.equal(resolveCaseRevenue({...c, mrr: '$20/月'}, [source]).mrr, '未披露');
  assert.equal(resolveCaseRevenue(c, [{...source, quotes: {Q1: 'Our monthly recurring revenue is $5000 as of August 2026.'}}]).mrr, '$5000/月');
  assert.equal(resolveCaseRevenue({...c, mrr: '$20/月', revenue_type: 'ai_estimate'}, [source]).mrr, '未披露');
});
test('local delivery and concrete validation fields are required even with readable sources', () => {
  const issues = opportunityQualityIssues({}, []);
  assert.ok(issues.includes('missing-local-feasibility')); assert.ok(issues.includes('missing-validation-plan'));
});

test('a complete research payload can pass without a disclosed revenue number', () => {
  const opp = Object.fromEntries(['title','thesis','why_now','customer','pain','who_pays','business_model','mvp_wedge','first_10_customers','bear_case'].map(k => [k, 'Specific analysis']));
  opp.validation_plan = { steps: ['Interview users', 'Measure trial use'], success_threshold: '3 trials', kill_condition: 'No trials', target_market: 'unknown', china_applicability: '待核实地域限制', solo_delivery: '人工复核，工时待测', unknowns: '付费意愿待验证' };
  const evidence = [{source_url: source.url, role: 'direct'}, {source_url: 'https://customer.com/story', role: 'direct'}, {source_url: source.url, role: 'counter'}];
  assert.deepEqual(opportunityQualityIssues(opp, evidence), []);
});
