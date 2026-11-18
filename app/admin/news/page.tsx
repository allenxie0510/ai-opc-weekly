'use client';
import { useState, useEffect } from 'react';
import {usePathname} from 'next/navigation';
import type { Article, Draft, Source, SourceRun } from '@/lib/news/types';
import { LANE_LABELS } from '@/lib/news/types';
type Row = { id: string; version: number; draft: Draft; state: string; reasons: string[]; event_key: string; news_documents: { article: Article; url: string }; news_sources: { definition: Source } };
type Data = { processing: { id: number; outcome: string; reasons: string[]; news_documents: { url: string } }[]; sources: { id: string; definition: Source }[]; runs: { source_id: string; checked_at: string; report: SourceRun }[]; queue: Row[]; history: { id: number; action: string; reason: string; created_at: string }[] };
const box = { border: '1px solid #d7dce2', borderRadius: 12, padding: 20, marginBottom: 16, background: 'white' };
const input = { width: '100%', border: '1px solid #adb5bf', padding: 10, borderRadius: 6, margin: '6px 0 14px' };
function ReviewItem({ row, all, act, busy }: { row: Row; all: Row[]; act: (row: Row, action: string, draft: Draft, reason: string, confirmed: boolean, target?: string) => Promise<void>; busy: boolean }) {
  const [draft, setDraft] = useState(row.draft); const [reason, setReason] = useState(''); const [confirmed, setConfirmed] = useState(false); const [target, setTarget] = useState('');
  const article = row.news_documents.article;
  const duplicate = all.filter(r => r.id !== row.id && r.event_key === row.event_key);
  const editable = !['published','merged'].includes(row.state);
  function patch(values: Partial<Draft>) { setDraft({ ...draft, ...values }); setConfirmed(false); }
  return <article style={box}>
    <p>{LANE_LABELS[draft.lane]} · {row.news_sources.definition.name} · {row.news_sources.definition.tier} · v{row.version}</p>
    <h2 style={{ fontSize: 22, fontWeight: 700, margin: '10px 0' }}>{draft.title}</h2>
    <p>来源发布时间：{article.publishedAt || '未知，必须核对'} · 事件日期：{draft.eventDate || '未知'}</p>
    <p>采集时间：{article.fetchedAt} · 原文 {article.body.length} 字符</p>
    {!!row.reasons.length && <p style={{ color: '#9a3412' }}>{row.reasons.join('；')}</p>}
    {!!article.issues.length && <p style={{ color: '#9a3412' }}>{article.issues.join('；')}</p>}
    {draft.sensitive && <p style={{ color: '#9a3412', fontWeight: 700 }}>重大或争议消息：发布前核对原始声明及独立来源，在审核理由记录核对结果。</p>}
    {!!duplicate.length && <p style={{ color: '#9a3412' }}>本页有 {duplicate.length} 条相同事件候选，请合并或确认事件区别。</p>}
    <a href={article.url} target="_blank" rel="noreferrer" style={{ color: '#175cd3' }}>打开原始来源 ↗</a>
    <details style={{ margin: '15px 0' }}><summary>原文与来源说明</summary><p>{row.news_sources.definition.note}</p><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', padding: 16, background: '#f4f5f7' }}>{article.body || '正文不可用'}</pre></details>
    <fieldset disabled={!editable || busy}>
      <label>标题<input style={input} value={draft.title} onChange={e => patch({ title: e.target.value })} maxLength={180} /></label>
      <label>事实摘要<textarea style={input} rows={4} value={draft.summary} onChange={e => patch({ summary: e.target.value })} maxLength={1200} /></label>
      <label>值得关注与限制<textarea style={input} rows={3} value={draft.relevance} onChange={e => patch({ relevance: e.target.value })} maxLength={600} /></label>
      <label>需求分类<select style={input} value={draft.lane} onChange={e => patch({ lane: e.target.value as Draft['lane'] })}>{Object.entries(LANE_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <p>逐项核对标题、摘要与数字。摘录必须逐字来自原文；存在原文摘录并不自动证明推断成立。</p>
      {draft.claims.map((claim, i) => <div key={i} style={{ borderLeft: '3px solid #a1aab5', paddingLeft: 12, marginTop: 12 }}>
        <label>事实 {i + 1}<input style={input} value={claim.text} onChange={e => patch({ claims: draft.claims.map((c,j) => i === j ? { ...c, text: e.target.value } : c) })} /></label>
        <label>证据摘录<textarea style={input} rows={3} value={claim.quote} onChange={e => patch({ claims: draft.claims.map((c,j) => i === j ? { ...c, quote: e.target.value } : c) })} /></label>
        <select aria-label="证据归属" value={claim.kind} onChange={e => patch({ claims: draft.claims.map((c,j) => i === j ? { ...c, kind: e.target.value as 'fact' | 'attributed' } : c) })}><option value="fact">事实</option><option value="attributed">来源声称／自述</option></select>
        <button onClick={() => patch({ claims: draft.claims.filter((_,j) => j !== i) })}>移除此项</button>
      </div>)}
      <button style={{ margin: '12px 0' }} onClick={() => patch({ claims: [...draft.claims, { text: '', quote: '', kind: 'attributed' }] })}>＋增加证据</button>
    </fieldset>
    <label>审核理由／核验记录（必填）<textarea style={input} value={reason} onChange={e => setReason(e.target.value)} /></label>
    {editable && <label style={{ display: 'block', marginBottom: 15 }}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 已核对全部事实、数字、事件时间和重复报道；自述没有被写成独立核实结果</label>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {editable && <><button disabled={busy || reason.trim().length < 2} onClick={() => act(row, 'save', draft, reason, false)}>保存修改</button><button disabled={busy || reason.trim().length < 2} onClick={() => act(row, 'reject', draft, reason, false)}>拒绝并留档</button></>}
      {row.state === 'pending' && <button disabled={busy || !confirmed || reason.trim().length < 2} onClick={() => act(row, 'publish', draft, reason, confirmed)}>审核通过并发布</button>}
      {['filtered','rejected','merged'].includes(row.state) && <button disabled={busy || reason.trim().length < 2} onClick={() => act(row, 'restore', draft, reason, false)}>恢复待审</button>}
      {row.state === 'published' && <button disabled={busy || reason.trim().length < 2} onClick={() => act(row, 'unpublish', draft, reason, false)}>下架并退回审核</button>}
    </div>
    {editable && <details style={{ marginTop: 16 }}><summary>合并到另一事件（保留本文和审核记录）</summary><input style={input} placeholder="目标审核条目 UUID" value={target} onChange={e => setTarget(e.target.value)} /><p>本条 ID：{row.id}</p><button disabled={busy || !target || reason.trim().length < 2} onClick={() => act(row, 'merge', draft, reason, false, target)}>确认是同一事件并合并</button></details>}
  </article>;
}
export default function NewsDesk() {
  const sourcesOnly=usePathname()==='/admin/sources';
  const [loadedAt,setLoadedAt] = useState(0); const token = '';  const [data,setData] = useState<Data | null>(null); const [state,setState] = useState('pending'); const [busy,setBusy] = useState(false); const [message,setMessage] = useState('');
  async function load(next = state) {
    setBusy(true); setMessage('');
    try { const res = await fetch(`/api/admin/news?state=${next}`, { headers: { 'x-admin-token': token }, cache: 'no-store' }); const json = await res.json(); if (!res.ok) throw new Error(json.error); setData(json); setLoadedAt(Date.now()); setState(next); }
    catch(e) { setMessage(String(e)); } finally { setBusy(false); }
  }
  async function act(row: Row, action: string, draft: Draft, reason: string, confirmed: boolean, target?: string) {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/admin/news', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ id: row.id, version: row.version, action, draft: ['save','publish'].includes(action) ? draft : null, reason, confirmed, target }) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error);
      await load(); setMessage('操作已保存，审核记录已留档。');
    } catch(e) { setMessage(String(e)); } finally { setBusy(false); }
  }
  useEffect(()=>{const timer=setTimeout(()=>{const initial=new URLSearchParams(window.location.search).get('state');void load(initial&&['pending','filtered','published','rejected','merged'].includes(initial)?initial:'pending');},0);return ()=>clearTimeout(timer);
  // Initial route state only; tabs control subsequent fetches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', color: '#17202c' }}>
    <h1 style={{fontSize:30,fontWeight:700}}>{sourcesOnly?'信源与采集':'资讯审核'}</h1><p>原始线索经价值筛选进入待审；核对证据后才能发布。系统筛出与待审核分别管理。</p><button disabled={busy} onClick={()=>void load()}>刷新数据</button>
    {message && <p role="alert" style={{ padding: 12, background: '#fff1d6' }}>{message}</p>}
    {data && <><details open={sourcesOnly} style={box}><summary>信源健康与采集审计（{data.sources.length} 个来源）</summary><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>来源</th><th>最近检查</th><th>状态／发现／可读</th><th>问题</th></tr></thead><tbody>{data.sources.map(s => { const r = data.runs.find(r => r.source_id === s.id); const stale = !r || loadedAt - Date.parse(r.checked_at) > s.definition.cadenceHours * 2 * 3600000; return <tr key={s.id}><td style={{ padding: 8 }}><a href={s.definition.url} target="_blank" rel="noreferrer">{s.definition.name}</a><p>{s.definition.tier} · {LANE_LABELS[s.definition.lane]}</p></td><td>{r?.checked_at || '尚未检查'}{stale && <strong> · 采集过期</strong>}</td><td>{r ? `${r.report.state} / ${r.report.discovered} / ${r.report.readable}` : '未知'}</td><td>{r?.report.error}</td></tr>; })}</tbody></table></div><p>“可读”表示正文提取通过基础检查，不代表事实已核实。长期无新内容需人工区分停更与采集问题。</p></details>
      {!sourcesOnly&&<><nav style={{ display: 'flex', gap: 16, margin: '20px 0' }}>{[['pending','待审核'],['filtered','系统筛出'],['published','已发布'],['rejected','已拒绝'],['merged','已合并']].map(([key,label]) => <button disabled={busy} style={{ fontWeight: key === state ? 800 : 400 }} key={key} onClick={() => load(key)}>{label}</button>)}</nav>
      <p>最近 100 条 · {data.queue.length} 条；更早记录保留在数据库。</p>
      {!data.queue.length && <p style={box}>当前状态没有条目。可切换“系统筛出”查看未达标原因，或切换“已发布”管理线上资讯。</p>}
      {data.queue.map(row => <ReviewItem key={`${row.id}:${row.version}`} row={row} all={data.queue} act={act} busy={busy} />)}
      </>}<details style={box}><summary>生成失败与证据拦截记录</summary>{data.processing.map(p => <p key={p.id}>{p.outcome} · {p.news_documents.url} · {p.reasons.join('；')}</p>)}</details>
      <details style={box}><summary>最近 30 条审核记录</summary>{data.history.map(h => <p key={h.id}>{h.created_at} · {h.action} · {h.reason}</p>)}</details>
    </>}
  </main>;
}
