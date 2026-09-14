import { publicSourceUrl } from './editorial-policy.mjs';
export const REPORT_VERSION = 1;
export const REPORT_DIMENSIONS = { customer:'客户问题', business:'商业逻辑', solo:'一人交付', evidence:'证据深度', learning:'可迁移性' };
export const REPORT_SECTIONS = { customer:'客户与付费理由', economics:'收费与成本结构', delivery:'一人交付工作流', acquisition:'首批客户从哪里来', differentiation:'竞争与切入空间', compounding:'可积累的长期资产' };
const strings=(value,keys)=>!!value&&keys.every(k=>typeof value[k]==='string'&&value[k].trim());
export function isWeeklyReport(value) {
  return !!value && value.version===REPORT_VERSION && strings(value,['headline','dek','verdict','generated_at','model','evidence_note'])
    && Number.isFinite(Date.parse(value.generated_at)) && Number.isFinite(value.score) && value.score>=0 && value.score<=100
    && Object.keys(REPORT_DIMENSIONS).every(k=>Number.isInteger(value.dimensions?.[k])&&value.dimensions[k]>=0&&value.dimensions[k]<=5)
    && Array.isArray(value.sources) && value.sources.length>=1 && value.sources.every(s=>strings(s,['id','title','url','accessed_at'])&&publicSourceUrl(s.url)&&Number.isFinite(Date.parse(s.accessed_at)))
    && Array.isArray(value.facts) && value.facts.length>=3 && value.facts.every(f=>strings(f,['claim','quote','source_id'])&&value.sources.some(s=>s.id===f.source_id))
    && strings(value.analysis,Object.keys(REPORT_SECTIONS))
    && Array.isArray(value.plan) && value.plan.length===3 && value.plan.every(p=>strings(p,['period','action','signal','stop']))
    && Array.isArray(value.risks) && value.risks.length>=2 && value.risks.every(r=>strings(r,['risk','test']))
    && Array.isArray(value.takeaways) && value.takeaways.length===3 && value.takeaways.every(t=>typeof t==='string'&&t.trim())
    && Array.isArray(value.open_questions) && value.open_questions.length>=2 && value.open_questions.every(t=>typeof t==='string'&&t.trim());
}
export function weeklyDeliveryReady(items) {
  return Array.isArray(items) && items.length>=5 && items.length<=6 && items.every(item=>isWeeklyReport(item.editorial_brief?.weekly_report));
}
