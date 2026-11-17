import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { SOURCES } from '../../lib/news/sources';
import { collect, hash } from '../../lib/news/collect';
import { EDITOR_PROMPT, eventIdentity, selectDrafts, validateDraft } from '../../lib/news/policy';
import type { Article, Draft, Source, SourceRun } from '../../lib/news/types';

const args = new Set(process.argv.slice(2));
const auditOnly = args.has('--audit');
const persist = args.has('--persist');
const modelEnabled = args.has('--generate');
if (persist && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Error('Persist requires Supabase server credentials');
if (modelEnabled && !process.env.ZHIPU_API_KEY) throw new Error('--generate requires ZHIPU_API_KEY');
const db = persist ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) : null;
const only = process.argv.find(v => v.startsWith('--sources='))?.slice(10).split(',');
const sources = SOURCES.filter(s => s.enabled && (!only || only.includes(s.id)));
if (!sources.length) throw new Error('No matching sources');
const runs: SourceRun[] = []; const articles: Article[] = [];
const drafts: { article: Article; draft: Draft; source: Source }[] = [];
const failures: { url: string; reasons: string[] }[] = [];

async function save(table: string, value: Record<string, unknown>, conflict?: string) {
  if (!db) return;
  const q = conflict ? db.from(table).upsert(value, { onConflict: conflict, ignoreDuplicates: ['news_documents', 'news_queue'].includes(table) }) : db.from(table).insert(value);
  const { error } = await q; if (error) throw new Error(`${table}: ${error.message}`);
}
async function generate(article: Article, source: Source): Promise<Draft> {
  const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.NEWS_MODEL || 'glm-4.7-flash', temperature: .1,
      messages: [{ role: 'system', content: EDITOR_PROMPT }, { role: 'user', content: JSON.stringify({ source: source.name, tier: source.tier, publishedAt: article.publishedAt, title: article.title, body: article.body.slice(0, 24000) }) }] }),
  });
  if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
  const payload = await response.json(); const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Missing model output');
  return JSON.parse(content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
}
async function main() {
const seenBodies = new Set<string>();
const generationCounts = { industry: 0, tools: 0, business: 0 };
const generationLimits = { industry: 6, tools: 10, business: 6 };
// Bounded concurrency, one source's outage never hides the rest.
for (let i = 0; i < sources.length; i += 3) {
  const results = await Promise.allSettled(sources.slice(i, i + 3).map(async s => {
    if (db) await save('news_sources', { id: s.id, definition: s }, 'id');
    const result = await collect(s, auditOnly ? 2 : 3);
    console.log(`${s.id}: ${result.run.state}, ${result.run.discovered} discovered, ${result.run.readable} readable`);
    return { ...result, source: s };
  }));
  for (const result of results) {
    if (result.status === 'rejected') { failures.push({ url: 'source', reasons: [String(result.reason)] }); continue; }
    const { source, run, articles: found } = result.value;
    runs.push(run); articles.push(...found);
    await save('news_source_runs', { source_id: source.id, checked_at: run.checkedAt, report: run });
    let sourceGenerated = 0;
    for (const article of found) {
      const id = hash(`${article.url}:${article.bodyHash}`);
      await save('news_documents', { id, source_id: source.id, url: article.url, body_hash: article.bodyHash, article }, 'id');
      if (!modelEnabled || article.state !== 'ready') continue;
      if (seenBodies.has(article.bodyHash)) { failures.push({ url: article.url, reasons: ['重复原文，保留证据但不重复生成'] }); continue; }
      seenBodies.add(article.bodyHash);
      // Known old stories stay available for audit, not fresh-news generation.
      if (article.publishedAt && Date.now() - Date.parse(article.publishedAt) > 14 * 86400000) { failures.push({ url: article.url, reasons: ['旧内容，仅作资料'] }); continue; }
      if (db) {
        const { data, error } = await db.from('news_queue').select('id').eq('document_id', id).limit(1);
        if (error) throw new Error(error.message);
        if (data?.length) continue;
      }
      if (sourceGenerated >= 2 || generationCounts[source.lane] >= generationLimits[source.lane]) continue;
      sourceGenerated++; generationCounts[source.lane]++;
      try {
        const draft = await generate(article, source); const errors = validateDraft(draft, article);
        if (errors.length) { failures.push({ url: article.url, reasons: errors }); await save('news_processing_log', { document_id: id, outcome: 'blocked', reasons: errors }); }
        else drafts.push({ article, draft, source });
      } catch (e) { failures.push({ url: article.url, reasons: [String(e)] }); await save('news_processing_log', { document_id: id, outcome: 'error', reasons: [String(e)] }); }
    }
  }
}
const selection = selectDrafts(drafts);
for (const row of drafts) {
  const accepted = selection.accepted.includes(row);
  const reasons = selection.rejected.find(r => r.url === row.article.url)?.reasons || [];
  const docId = hash(`${row.article.url}:${row.article.bodyHash}`);
  await save('news_queue', { document_id: docId, source_id: row.source.id, draft: row.draft, event_key: row.draft.eventDate ? eventIdentity(row.draft) : hash(`${eventIdentity(row.draft)}:${row.article.url}`), state: accepted ? 'pending' : 'filtered', reasons }, 'document_id');
}
await mkdir('output/news-audit', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const report = { generatedAt: new Date().toISOString(), mode: { persist, modelEnabled }, runs, samples: articles, selection, failures };
await writeFile(`output/news-audit/${stamp}.json`, JSON.stringify(report, null, 2));
await writeFile('output/news-audit/latest.json', JSON.stringify(report, null, 2));
await writeFile('output/news-audit/latest.md', `# 信源检查\n\n检查时间：${report.generatedAt}\n\n|信源|状态|发现|原文可读|问题|\n|---|---|---:|---:|---|\n${runs.map(r => `|${r.sourceId}|${r.state}|${r.discovered}|${r.readable}|${(r.error || '').replace(/\|/g, '/')}|`).join('\n')}\n\n只表示本次采集结果，健康不代表每篇内容可信。正文样本和筛选原因见 latest.json。\n`);
console.log(`Report: output/news-audit/latest.md; ${selection.accepted.length} review candidates; ${failures.length} failures`);
if (!runs.some(r => r.state === 'healthy') || failures.some(f => f.url === 'source')) process.exitCode = 1;

}
main().catch(e => { console.error(String(e)); process.exitCode = 1; });
