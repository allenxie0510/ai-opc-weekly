import { publicSourceUrl, inferOperatingMarket } from './editorial-policy.mjs';

/** Administrator records an independent evidence source, not a copy of a paid post. */
export function validateResearchIntake(body = {}) {
  const title = String(body.title || '').trim();
  const source_url = String(body.source_url || '').trim();
  const lead_url = String(body.lead_url || '').trim();
  const excerpt = String(body.excerpt || '').trim();
  const research_question = String(body.research_question || '').trim();
  const permission_note = String(body.permission_note || '').trim();
  const rights_basis = body.rights_basis;
  if (title.length < 2 || title.length > 200 || research_question.length > 600 || excerpt.length > 1600 || permission_note.length > 1000) throw new Error('标题2–200字，问题最多600字，必要证据摘录最多1600字，授权记录最多1000字');
  if (lead_url && (!/^https?:\/\//.test(lead_url) || lead_url.length > 2000)) throw new Error('线索链接格式无效');
  if (source_url && (!publicSourceUrl(source_url) || source_url.length > 2000)) throw new Error('证据必须为独立公开/授权来源，不能直接使用生财或知识星球地址');
  if (!['public-source', 'author-permission'].includes(rights_basis)) throw new Error('请选择证据使用依据');
  if (excerpt && !source_url) throw new Error('没有独立证据来源时只保存线索URL和自己的研究问题，不保存付费正文');
  const verified = body.confirm_verified === true;
  if (verified) {
    if (!source_url || excerpt.length < 40) throw new Error('核实需证据链接与至少40字必要摘录');
    if (rights_basis === 'author-permission' && permission_note.length < 20) throw new Error('请记录授权人、日期、允许公开范围与凭证位置（至少20字）');
    if (inferOperatingMarket(`${title} ${excerpt}`) !== 'domestic') throw new Error('本队列为国内深度案例；摘录需明确国内经营客户/市场，不能只凭中文判断');
  }
  return { title, lead_url, research_question, source_url, excerpt, rights_basis, permission_note,
    status: verified ? 'verified' : 'lead', verified_at: verified ? new Date().toISOString() : null };
}
