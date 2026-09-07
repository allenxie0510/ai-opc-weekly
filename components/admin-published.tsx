'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CONTENT_TYPES, CONTENT_LABELS, type ContentType, type PublishedContentRow } from '@/lib/admin-content';
import { LineIcon } from '@/components/icons';

const FIELDS: Record<ContentType, [string, string][]> = {
  weekly: [['title', '标题'], ['summary', '摘要']],
  radar: [['title', '标题'], ['summary', '摘要'], ['pick_reason', '收录理由'], ['editor_note', '编辑点评'], ['category', '分类'], ['score', '评分']],
  opportunity: [['title', '标题'], ['thesis', '机会论断'], ['editor_take', '主编点评'], ['recommendation', '建议结论'], ['editor_conviction', '主编信心'], ['category', '分类']],
};
const OPTIONS: Record<string, string[]> = {
  recommendation: ['BUILD', 'WATCH', 'NICHE_ONLY', 'SKIP'], editor_conviction: ['high', 'medium', 'low'],
  category: ['micro-saas', 'design-assets', 'automation', 'content-monetize', 'indie-tool', 'digital-product', 'other'],
};
export function AdminPublished({ token, externalBusy = false, onChanged, onDirtyChange, onBusyChange }: {
  token: string; externalBusy?: boolean; onChanged: () => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [type, setType] = useState<ContentType>('opportunity');
  const [input, setInput] = useState(''); const [query, setQuery] = useState('');
  const [page, setPage] = useState(1); const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<PublishedContentRow[]>([]); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [mutating, setBusy] = useState(false);
  const busy = mutating || externalBusy;
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<string | null>(null); const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/content?${new URLSearchParams({ type, page: String(page), q: query })}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '加载失败'); return data; })
      .then(data => { if (controller.signal.aborted) return; const maxPage = Math.max(1, Math.ceil(data.total / 20)); if (page > maxPage) { setPage(maxPage); return; } setRows(data.rows); setTotal(data.total); setError(''); })
      .catch(e => { if (!controller.signal.aborted) { setRows([]); setError(e.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [type, page, query, revision]);
  function cancel() { setEditing(null); setForm({}); onDirtyChange(false); }
  function canLeave() { if (editing && !confirm('编辑尚未保存，确认放弃本次修改？')) return false; cancel(); return true; }
  function reload() { setLoading(true); setRows([]); setRevision(n => n + 1); }
  async function mutate(endpoint: string, payload: object, success: string) {
    if (busy) return;
    setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '操作失败');
      if ('affected' in data && data.affected === 0) throw new Error('内容状态已变化，本次未修改任何内容，请刷新');
      cancel(); setMessage(success); reload(); onChanged();
      try {
        const cache = await fetch('/api/admin/revalidate', { method: 'POST', headers: { 'x-admin-token': token } });
        if (!cache.ok) throw new Error('cache refresh failed');
      } catch { setMessage(success + '；前台缓存刷新失败，等待自动更新后再检查'); }
    } catch (e) { setError(e instanceof Error ? e.message : '网络错误'); }
    finally { setBusy(false); onBusyChange(false); }
  }
  function action(row: PublishedContentRow, action: string) {
    const prompt = action === 'discard' ? `确认永久删除「${row.title}」${type === 'weekly' ? '及其中全部条目' : ''}？不可恢复。` : `确认下架「${row.title}」并退回待审核？`;
    if (['discard', 'unpublish'].includes(action) && !confirm(prompt)) return;
    void mutate('/api/admin/publish', { type, action, ids: [row.id] }, action === 'discard' ? '已删除' : action === 'unpublish' ? '已下架，内容已回到待审核' : '推荐位已更新');
  }
  return <section className="admin-published" aria-label="已发布内容管理">
    <div className="admin-filter-tabs" role="group" aria-label="已发布内容类型">{CONTENT_TYPES.map(value => <button key={value} className="admin-btn" aria-pressed={value === type} disabled={busy} onClick={() => { if (value === type || !canLeave()) return; setLoading(true); setRows([]); setType(value); setPage(1); }}>{CONTENT_LABELS[value]}</button>)}</div>
    <form className="admin-content-search" onSubmit={e => { e.preventDefault(); if (!canLeave()) return; setQuery(input.trim()); setPage(1); reload(); }}>
      <label htmlFor="published-search">搜索标题</label><input id="published-search" value={input} maxLength={100} onChange={e => setInput(e.target.value)} placeholder="搜索全部历史已发布内容" />
      <button className="admin-btn" disabled={busy}>搜索</button><button type="button" className="admin-btn" disabled={busy || loading} onClick={() => { if (canLeave()) reload(); }}>刷新列表</button>
    </form>
    {message && <p className="admin-msg" role="status">{message}</p>}{error && <p className="analytics-error" role="alert">{error}</p>}
    {loading ? <p className="admin-empty" role="status">加载中…</p> : !error && <p className="analytics-note">共 {total} 条{CONTENT_LABELS[type]}{query ? ` · 标题包含「${query}」` : ' · 包含全部历史，不限最近日期'}</p>}
    {!loading && !error && rows.length === 0 && <p className="admin-empty">没有符合条件的已发布内容</p>}
    <div className="admin-list">{rows.map(row => <article className="admin-item" key={row.id}>
      {editing === row.id ? <form className="admin-edit-form" onSubmit={e => { e.preventDefault(); void mutate('/api/admin/edit', { type, id: row.id, fields: form }, '修改已保存'); }}>
        {FIELDS[type].map(([key, label]) => <label className="admin-field" key={key}><span>{label}</span>
          {OPTIONS[key] && (key !== 'category' || type === 'radar') ? <select value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })}>{OPTIONS[key].map(option => <option key={option} value={option}>{option}</option>)}</select>
            : ['summary', 'thesis', 'editor_take', 'editor_note'].includes(key) ? <textarea rows={3} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
              : <input type={key === 'score' ? 'number' : 'text'} min={key === 'score' ? 0 : undefined} max={key === 'score' ? 100 : undefined} required={key === 'title'} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />}
        </label>)}<div className="admin-actions"><button className="admin-btn primary" disabled={busy}>保存修改</button><button type="button" className="admin-btn" disabled={busy} onClick={cancel}>取消</button></div>
      </form> : <>
        <div className="admin-item-body admin-published-body"><h3 className="admin-item-title">{row.title}</h3>
          <p className="admin-item-meta">{row.published_at ? new Date(row.published_at).toLocaleDateString('zh-CN') : '日期未记录'}{row.source_name ? ` · ${row.source_name}` : ''}{row.featured ? ' · 首页推荐' : ''}{row.score_total != null ? ` · OPC ${row.score_total}` : ''}</p>
          <p className="admin-item-summary">{row.thesis || row.summary}</p>
          {row.slug && <Link className="admin-note-toggle" href={type === 'weekly' ? `/weekly/${row.slug}` : `/opportunities/${row.slug}`} target="_blank">查看前台页面</Link>}
          {row.source_url && <a className="admin-note-toggle" href={row.source_url} target="_blank" rel="noopener noreferrer">查看原始来源</a>}
          {type === 'weekly' && <details className="admin-weekly-details"><summary>查看条目（{row.items?.length || 0}）</summary><ol className="admin-weekly-items">{[...(row.items || [])].sort((a,b) => a.rank - b.rank).map(item => <li key={item.id}>{item.title}<button className="admin-weekly-item-delete" disabled={busy} onClick={() => { if (confirm(`仅删除「${item.title}」？整期周报将保留。`)) void mutate('/api/admin/publish', { type: 'news_item', action: 'discard', ids: [item.id] }, '该条资讯已删除，整期周报保留'); }}>删除此条</button></li>)}</ol></details>}
        </div>
        <div className="admin-item-btns">
          <button className="admin-btn sm" disabled={busy} onClick={() => { if (!canLeave()) return; setEditing(row.id); setForm(Object.fromEntries(FIELDS[type].map(([key]) => [key, String(row[key as keyof PublishedContentRow] ?? (key === 'recommendation' ? 'WATCH' : key === 'editor_conviction' ? 'medium' : key === 'category' && type === 'radar' ? 'other' : ''))]))); onDirtyChange(true); }}>编辑</button>
          <button className="admin-btn sm" disabled={busy} onClick={() => action(row, 'unpublish')}>下架</button>
          <button className="admin-btn danger sm" disabled={busy} onClick={() => action(row, 'discard')}>{type === 'weekly' ? '删除整期' : '删除'}</button>
          {type === 'opportunity' && <><button className="admin-btn sm" disabled={busy} onClick={() => action(row, row.featured ? 'unfeature' : 'feature')}>{row.featured ? '取消推荐' : '设为推荐'}</button><button className="admin-btn sm" disabled={busy} onClick={() => { void mutate('/api/admin/trigger', { workflow: 'backfill-covers', clear: row.slug }, '封面任务已触发，稍后刷新列表查看'); }}><LineIcon name="palette" /> {row.cover_url ? '重生成封面' : '补封面'}</button></>}
        </div>
      </>}
    </article>)}</div>
    {!error && <div className="admin-pagination"><button className="admin-btn" disabled={busy || loading || page <= 1} onClick={() => { if (!canLeave()) return; setLoading(true); setRows([]); setPage(page - 1); }}>上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 页</span><button className="admin-btn" disabled={busy || loading || page * 20 >= total} onClick={() => { if (!canLeave()) return; setLoading(true); setRows([]); setPage(page + 1); }}>下一页</button></div>}
  </section>;
}
