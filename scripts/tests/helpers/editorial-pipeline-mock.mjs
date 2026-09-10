// Test-only in-memory network: every unexpected request fails, never hits the internet.
import { writeFileSync } from 'node:fs';
const quote = '面向国内商家的 AI 商品图设计服务';
const excerpt = `${quote}，客户按订单付款，由设计师人工审核。作者自述已完成首批客户交付，收入没有公开披露。`;
const answers = Object.fromEntries(['payer', 'problem', 'ai_role', 'solo_delivery', 'evidence', 'risk'].map(key => [key, { answer: quote, basis: 'source', quote }]));
const article = { title: '「测试专用项目」：商品图服务', description: '仅用于集成测试，不是真实案例。', insight: '测试判断，不发布。', category: 'design-assets', refs: [{ label: '测试来源', url: 'https://example.com/test-only' }],
  editorial_brief: { operating_market: 'domestic', market_quote: quote, business_form: 'design', answers }, mrr_range: '未披露', tags: ['测试'] };
const writes = [];
let created = false;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.hostname === 'open.bigmodel.cn') {
    const body = JSON.parse(init.body);
    if (body.messages.some(m => /SECRET-LEAD|SECRET-PERMISSION|SECRET-QUESTION/.test(m.content))) throw new Error('Private research metadata leaked to model');
    if (body.tools) throw new Error('Grounded mode must not use web search');
    return Response.json({ choices: [{ message: { content: JSON.stringify([article]) } }] });
  }
  if (url.hostname !== 'editorial-pipeline.test') throw new Error(`Unexpected external fetch: ${url}`);
  if (init.method && init.method !== 'GET') {
    writes.push({ path: url.pathname, method: init.method, body: JSON.parse(init.body) });
    if (url.pathname.endsWith('/weekly_issues') && init.method === 'POST') created = true;
    writeFileSync(process.env.TEST_WRITES_PATH, JSON.stringify(writes));
    return Response.json([]);
  }
  if (url.pathname.endsWith('/editorial_research')) return Response.json([{ id: 'test-research', title: '测试专用项目', excerpt, source_url: article.refs[0].url, rights_basis: 'public-source', verified_at: new Date().toISOString(), lead_url: 'SECRET-LEAD', permission_note: 'SECRET-PERMISSION', research_question: 'SECRET-QUESTION' }]);
  if (url.pathname.endsWith('/weekly_issues') && created) return Response.json([{ id: 'test-issue' }]);
  return Response.json([]);
};
