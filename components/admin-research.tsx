'use client';
import { useCallback, useEffect, useState } from 'react';
type Entry = { id?: string; title: string; lead_url: string; research_question: string; source_url: string; excerpt: string; rights_basis: string; permission_note: string; status?: string; confirm_verified?: boolean };
const empty: Entry = { title: '', lead_url: '', research_question: '', source_url: '', excerpt: '', rights_basis: 'public-source', permission_note: '', confirm_verified: false };
export function AdminResearch({ token }: { token: string }) {
  const [items, setItems] = useState<Entry[]>([]);
  const [form, setForm] = useState<Entry>(empty);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const read = useCallback(async (): Promise<Entry[]> => {
    const res = await fetch('/api/admin/research', { headers: { 'x-admin-token': token }, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.items || [];
  }, [token]);
  const load = useCallback(async () => {
    try {
      setItems(await read());
    } catch (e) { setMessage(e instanceof Error ? e.message : '读取失败'); }
  }, [read]);
  useEffect(() => {
    let active = true;
    read().then(rows => { if (active) setItems(rows); }).catch(e => { if (active) setMessage(e instanceof Error ? e.message : '读取失败'); });
    return () => { active = false; };
  }, [read]);
  return <section className="admin-section admin-research">
    <h2>国内案例研究</h2>
    <p>每周争取 1–2 篇，不是发布配额。公开来源打底 → 线索核实或作者授权 → 周报草稿 → 人工发布。</p>
    <p>生财仅记录链接和自己的研究问题。请勿粘贴付费正文、SOP、客户隐私或未获准公开的数字。</p>
    <p role="status">{message}</p>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setMessage('');
      try {
        const res = await fetch('/api/admin/research', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify(form) });
        const data = await res.json(); if (!res.ok) throw new Error(data.error);
        setForm(empty); setMessage('已保存。只有核实后的证据会进入每周案例写稿，仍需人工审核发布。'); await load();
      } catch (e) { setMessage(e instanceof Error ? e.message : '保存失败'); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy}>
        {([['title', '真实项目名', 200], ['lead_url', '内部线索链接（可选，不会公开）', 2000], ['research_question', '自己的研究问题（不要复制付费内容）', 600], ['source_url', '独立公开来源 / 作者授权证据链接', 2000], ['excerpt', '必要的原文事实摘录：国内客户、付费需求、AI环节与经营证据', 1600]] as const).map(([key, label, limit]) => <label className="admin-field" key={key}><span>{label}</span>{key === 'excerpt' || key === 'research_question'
          ? <textarea rows={key === 'excerpt' ? 6 : 2} maxLength={limit} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value, confirm_verified: false })} />
          : <input type={key.endsWith('url') ? 'url' : 'text'} required={key === 'title'} maxLength={limit} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value, confirm_verified: false })} />}</label>)}
        <label className="admin-field"><span>使用依据（公开不等于可转载全文）</span><select value={form.rights_basis} onChange={e => setForm({ ...form, rights_basis: e.target.value, confirm_verified: false })}><option value="public-source">公开事实来源 · 原创分析与必要引用</option><option value="author-permission">作者明确授权 · 限授权范围</option></select></label>
        {form.rights_basis === 'author-permission' && <label className="admin-field"><span>内部授权记录：授权人、日期、范围、凭证位置（不公开）</span><textarea maxLength={1000} value={form.permission_note} onChange={e => setForm({ ...form, permission_note: e.target.value, confirm_verified: false })} /></label>}
        <label className="research-confirm"><input type="checkbox" checked={!!form.confirm_verified} onChange={e => setForm({ ...form, confirm_verified: e.target.checked })} />我已打开独立来源核对原文、确认国内经营场景；摘录可用于公开原创分析，授权范围及个人信息已检查。收入自述不视为审计。</label>
        <div className="admin-actions"><button className="admin-btn primary" type="submit">{busy ? '保存中…' : form.confirm_verified ? '保存核实证据，进入每周写稿' : '保存内部线索'}</button><button className="admin-btn" type="button" onClick={() => setForm(empty)}>清空 / 新建</button></div>
      </fieldset>
    </form>
    <h3>研究队列（最近 200 条）</h3>
    {items.length === 0 && <p>暂无线索。不会自动导入付费社群。</p>}
    {items.map(item => <article className="research-row" key={item.id}><div><strong>{item.title}</strong><p>{item.status === 'verified' ? '证据已核对，待写稿' : item.status === 'drafted' ? '已进入周报草稿' : '内部线索，禁止入模发布'}</p></div><button className="admin-btn" disabled={busy || item.status === 'drafted'} onClick={() => { setForm({ ...item, confirm_verified: false }); setMessage('请补充证据，重新勾选核实确认后保存。'); }}>补充 / 核实</button></article>)}
  </section>;
}
