'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/page-shell';
import { RECOMMENDATION_MAP, CONVICTION_MAP, CATEGORY_MAP } from '@/lib/types';

type RadarDraft = {
  id: string;
  title: string;
  summary: string;
  source_name: string;
  source_url: string;
  score: number;
  category: string;
  pick_reason: string | null;
  editor_note: string | null;
  published_at: string;
};

type WeeklyDraft = {
  id: string;
  slug: string;
  issue_number: number;
  title: string;
  summary: string;
  published_at: string;
  items: { id: string; title: string; section: string; rank: number }[];
};

type RadarRejected = {
  id: string;
  title: string;
  source_name: string;
  source_url: string;
  reject_reason: string | null;
  published_at: string;
};

type OpportunityDraft = {
  id: string;
  slug: string;
  title: string;
  thesis: string | null;
  category: string | null;
  score_total: number | null;
  evidence_grade: string | null;
  recommendation: string | null;
  editor_conviction: string | null;
  editor_take: string | null;
  evidence: { claim?: string; source_name?: string; source_url?: string; quote?: string; tier?: string }[] | null;
  created_at: string;
};

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [radarDrafts, setRadarDrafts] = useState<RadarDraft[]>([]);
  const [weeklyDrafts, setWeeklyDrafts] = useState<WeeklyDraft[]>([]);
  const [radarRejected, setRadarRejected] = useState<RadarRejected[]>([]);
  const [opportunityDrafts, setOpportunityDrafts] = useState<OpportunityDraft[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedNote, setExpandedNote] = useState<Set<string>>(new Set());
  const [expandedIssue, setExpandedIssue] = useState<Set<string>>(new Set());
  const [expandedOpp, setExpandedOpp] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // 编辑态：editing = { type, id } | null；editForm 为正在编辑的字段副本
  const [editing, setEditing] = useState<{ type: 'radar' | 'weekly' | 'opportunity'; id: string } | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string | number>>({});

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/review', {
        headers: { 'x-admin-token': t },
        cache: 'no-store',
      });      if (res.status === 401) {
        localStorage.removeItem('ai_opc_admin_token');
        setAuthed(false);
        setMessage('密码错误，请重新输入');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '加载失败');
        return;
      }
      setRadarDrafts(data.radarDrafts || []);
      setWeeklyDrafts(data.weeklyDrafts || []);
      setRadarRejected(data.radarRejected || []);
      setOpportunityDrafts(data.opportunityDrafts || []);
      setSelected(new Set());
      setAuthed(true);
    } catch {
      setMessage('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('ai_opc_admin_token');
    if (saved) {
      setToken(saved);
      void load(saved);
    }
  }, [load]);

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput) return;
    localStorage.setItem('ai_opc_admin_token', passwordInput);
    setToken(passwordInput);
    void load(passwordInput);
  }

  async function revalidateSite() {
    // 发布/下架/丢弃后立即清除前台 ISR 缓存，访客即时看到变化
    try {
      await fetch('/api/admin/revalidate', {
        method: 'POST',
        headers: { 'x-admin-token': token },
      });
    } catch {
      // 失败不阻塞，退化为 5 分钟周期生效
    }
  }

  async function act(action: 'publish' | 'discard' | 'unpublish', type: 'radar' | 'weekly' | 'opportunity', ids: string[]) {
    if (ids.length === 0 || busy) return;
    if (action === 'discard' && !window.confirm(`确认丢弃 ${ids.length} 条？不可恢复。`)) return;
    if (action === 'unpublish' && !window.confirm(`确认下架 ${ids.length} 条？前台将不可见，可在草稿区编辑后重新发布。`)) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ action, type, ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '操作失败');
      } else {
        setMessage(
          action === 'publish'
            ? `已发布 ${data.affected} 条 ✓（前台即时生效）`
            : action === 'unpublish'
              ? `已下架 ${data.affected} 条（已退回草稿区）`
              : `已丢弃 ${data.affected} 条`,
        );
        await revalidateSite();
        await load(token);
      }
    } catch {
      setMessage('网络错误');
    } finally {
      setBusy(false);
    }
  }

  async function trigger(workflow: 'daily-radar' | 'weekly-newsletter' | 'weekly-opportunities') {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ workflow }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '触发失败');
      } else {
        setMessage(
          workflow === 'daily-radar'
            ? '已触发雷达抓取 + 生成 ⚡ 约 2–3 分钟后点「刷新」查看新草稿'
            : workflow === 'weekly-newsletter'
              ? '已触发周报生成 ⚡ 约 3–5 分钟后点「刷新」查看草稿'
              : '已触发机会生产线 ⚡ 约 3–5 分钟后点「刷新」查看机会草稿',
        );
      }
    } catch {
      setMessage('网络错误');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(type: 'radar' | 'weekly' | 'opportunity', id: string, fields: Record<string, string | number>) {
    setEditing({ type, id });
    setEditForm(fields);
    setMessage('');
  }

  function cancelEdit() {
    setEditing(null);
    setEditForm({});
  }

  async function saveEdit(thenPublish: boolean) {
    if (!editing || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ type: editing.type, id: editing.id, fields: editForm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '保存失败');
        return;
      }
      const editId = editing.id;
      const editType = editing.type;
      cancelEdit();
      if (thenPublish) {
        await act('publish', editType, [editId]); // act 内部会 reload
      } else {
        setMessage('已保存 ✓');
        await load(token);
      }
    } catch {
      setMessage('网络错误');
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === radarDrafts.length ? new Set() : new Set(radarDrafts.map((d) => d.id)),
    );
  }

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <Header />
      <main className="container admin-page" style={{ paddingTop: 48, paddingBottom: 80 }}>
        {!authed ? (
          <form className="admin-login" onSubmit={login}>
            <h1>审核台</h1>
            <p className="admin-hint">输入管理密码（Vercel 的 ADMIN_PASSWORD）</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="管理密码"
              autoFocus
            />
            <button type="submit" disabled={loading}>
              {loading ? '验证中…' : '进入'}
            </button>
            {message && <p className="admin-msg">{message}</p>}
          </form>
        ) : (
          <>
            <div className="admin-topbar">
              <h1>审核台</h1>
              <div className="admin-actions">
                <button
                  className="admin-btn primary"
                  onClick={() => void trigger('daily-radar')}
                  disabled={busy}
                >
                  ⚡ 立即拉取雷达
                </button>
                <button
                  className="admin-btn"
                  onClick={() => void trigger('weekly-newsletter')}
                  disabled={busy}
                >
                  ⚡ 生成周报
                </button>
                <button
                  className="admin-btn"
                  onClick={() => void trigger('weekly-opportunities')}
                  disabled={busy}
                >
                  ⚡ 生成机会
                </button>
                <button className="admin-btn" onClick={() => void load(token)} disabled={loading}>
                  {loading ? '刷新中…' : '刷新'}
                </button>
              </div>
            </div>
            {message && <p className="admin-msg">{message}</p>}

            {/* ---------- 雷达草稿 ---------- */}
            <section className="admin-section">
              <div className="admin-section-head">
                <h2>
                  雷达草稿 <span className="admin-count">{radarDrafts.length}</span>
                </h2>
                {radarDrafts.length > 0 && (
                  <div className="admin-actions">
                    <button className="admin-btn" onClick={toggleAll}>
                      {selected.size === radarDrafts.length ? '取消全选' : '全选'}
                    </button>
                    <button
                      className="admin-btn primary"
                      disabled={selected.size === 0 || busy}
                      onClick={() => void act('publish', 'radar', [...selected])}
                    >
                      发布选中（{selected.size}）
                    </button>
                    <button
                      className="admin-btn danger"
                      disabled={selected.size === 0 || busy}
                      onClick={() => void act('discard', 'radar', [...selected])}
                    >
                      丢弃选中
                    </button>
                    <button
                      className="admin-btn primary"
                      disabled={busy}
                      onClick={() => void act('publish', 'radar', radarDrafts.map((d) => d.id))}
                    >
                      全部发布
                    </button>
                  </div>
                )}
              </div>

              {radarDrafts.length === 0 ? (
                <p className="admin-empty">没有待审核的雷达条目</p>
              ) : (
                <div className="admin-list">
                  {radarDrafts.map((d) => (
                    <div key={d.id} className={`admin-item${selected.has(d.id) ? ' checked' : ''}`}>
                      {editing?.type === 'radar' && editing.id === d.id ? (
                        /* ─── 雷达编辑表单 ─── */
                        <div className="admin-edit-form">
                          <label className="admin-field">
                            <span>标题</span>
                            <input
                              value={String(editForm.title ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            />
                          </label>
                          <label className="admin-field">
                            <span>摘要</span>
                            <textarea
                              rows={3}
                              value={String(editForm.summary ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                            />
                          </label>
                          <label className="admin-field">
                            <span>编辑点评</span>
                            <textarea
                              rows={3}
                              value={String(editForm.editor_note ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, editor_note: e.target.value })}
                            />
                          </label>
                          <div className="admin-field-row">
                            <label className="admin-field">
                              <span>评分（0–100）</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={String(editForm.score ?? 0)}
                                onChange={(e) => setEditForm({ ...editForm, score: e.target.value })}
                              />
                            </label>
                            <label className="admin-field">
                              <span>收录理由</span>
                              <input
                                value={String(editForm.pick_reason ?? '')}
                                onChange={(e) => setEditForm({ ...editForm, pick_reason: e.target.value })}
                              />
                            </label>
                            <label className="admin-field">
                              <span>分类</span>
                              <select
                                value={String(editForm.category ?? 'indie-tool')}
                                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              >
                                <option value="micro-saas">micro-saas</option>
                                <option value="design-assets">design-assets</option>
                                <option value="automation">automation</option>
                                <option value="content-monetize">content-monetize</option>
                                <option value="indie-tool">indie-tool</option>
                                <option value="digital-product">digital-product</option>
                              </select>
                            </label>
                          </div>
                          <div className="admin-edit-btns">
                            <button className="admin-btn primary" disabled={busy} onClick={() => void saveEdit(true)}>
                              保存并发布
                            </button>
                            <button className="admin-btn" disabled={busy} onClick={() => void saveEdit(false)}>
                              仅保存
                            </button>
                            <button className="admin-btn" disabled={busy} onClick={cancelEdit}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <label className="admin-item-main">
                            <input
                              type="checkbox"
                              checked={selected.has(d.id)}
                              onChange={() => toggle(d.id)}
                            />
                            <span className="admin-item-body">
                              <span className="admin-item-title-row">
                                <span className="admin-score">{d.score}</span>
                                <a
                                  href={d.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="admin-item-title"
                                >
                                  {d.title}
                                </a>
                              </span>
                              <span className="admin-item-meta">
                                {d.source_name} · {d.category} · {d.published_at}
                              </span>
                              {d.pick_reason && (
                                <span className="admin-item-reason">✦ {d.pick_reason}</span>
                              )}
                              <span className="admin-item-summary">{d.summary}</span>
                              {d.editor_note && (
                                <button
                                  type="button"
                                  className="admin-note-toggle"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    toggleSet(setExpandedNote, d.id);
                                  }}
                                >
                                  {expandedNote.has(d.id) ? '收起点评 ▲' : '编辑点评 ▼'}
                                </button>
                              )}
                              {d.editor_note && expandedNote.has(d.id) && (
                                <span className="admin-item-note">{d.editor_note}</span>
                              )}
                            </span>
                          </label>
                          <div className="admin-item-btns">
                            <button
                              className="admin-btn sm"
                              disabled={busy}
                              onClick={() =>
                                startEdit('radar', d.id, {
                                  title: d.title,
                                  summary: d.summary,
                                  editor_note: d.editor_note || '',
                                  pick_reason: d.pick_reason || '',
                                  category: d.category,
                                  score: d.score,
                                })
                              }
                            >
                              编辑
                            </button>
                            <button
                              className="admin-btn primary sm"
                              disabled={busy}
                              onClick={() => void act('publish', 'radar', [d.id])}
                            >
                              发布
                            </button>
                            <button
                              className="admin-btn danger sm"
                              disabled={busy}
                              onClick={() => void act('discard', 'radar', [d.id])}
                            >
                              丢弃
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- 周报草稿 ---------- */}
            <section className="admin-section">
              <div className="admin-section-head">
                <h2>
                  周报草稿 <span className="admin-count">{weeklyDrafts.length}</span>
                </h2>
              </div>
              {weeklyDrafts.length === 0 ? (
                <p className="admin-empty">没有待发布的周报</p>
              ) : (
                <div className="admin-list">
                  {weeklyDrafts.map((w) => (
                    <div key={w.id} className="admin-item weekly">
                      {editing?.type === 'weekly' && editing.id === w.id ? (
                        /* ─── 周报编辑表单 ─── */
                        <div className="admin-edit-form">
                          <label className="admin-field">
                            <span>标题</span>
                            <input
                              value={String(editForm.title ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            />
                          </label>
                          <label className="admin-field">
                            <span>摘要</span>
                            <textarea
                              rows={4}
                              value={String(editForm.summary ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                            />
                          </label>
                          <div className="admin-edit-btns">
                            <button className="admin-btn primary" disabled={busy} onClick={() => void saveEdit(true)}>
                              保存并发布
                            </button>
                            <button className="admin-btn" disabled={busy} onClick={() => void saveEdit(false)}>
                              仅保存
                            </button>
                            <button className="admin-btn" disabled={busy} onClick={cancelEdit}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="admin-item-main">
                            <div className="admin-item-body">
                              <span className="admin-item-title-row">
                                <span className="admin-score">#{w.issue_number}</span>
                                <span className="admin-item-title">{w.title}</span>
                              </span>
                              <span className="admin-item-meta">
                                /weekly/{w.slug} · {w.items.length} 条 · {w.published_at}
                              </span>
                              <span className="admin-item-summary">{w.summary}</span>
                              <button
                                type="button"
                                className="admin-note-toggle"
                                onClick={() => toggleSet(setExpandedIssue, w.id)}
                              >
                                {expandedIssue.has(w.id) ? '收起条目 ▲' : '查看条目 ▼'}
                              </button>
                              {expandedIssue.has(w.id) && (
                                <ol className="admin-weekly-items">
                                  {w.items.map((it) => (
                                    <li key={it.id}>
                                      <em>{it.section}</em> {it.title}
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          </div>
                          <div className="admin-item-btns">
                            <button
                              className="admin-btn sm"
                              disabled={busy}
                              onClick={() => startEdit('weekly', w.id, { title: w.title, summary: w.summary })}
                            >
                              编辑
                            </button>
                            <button
                              className="admin-btn primary sm"
                              disabled={busy}
                              onClick={() => void act('publish', 'weekly', [w.id])}
                            >
                              发布本期
                            </button>
                            <button
                              className="admin-btn danger sm"
                              disabled={busy}
                              onClick={() => void act('discard', 'weekly', [w.id])}
                            >
                              丢弃本期
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- 机会草稿（Opportunities） ---------- */}
            <section className="admin-section">
              <div className="admin-section-head">
                <h2>
                  机会草稿 <span className="admin-count">{opportunityDrafts.length}</span>
                </h2>
              </div>
              {opportunityDrafts.length === 0 ? (
                <p className="admin-empty">没有待审核的机会（点上方「⚡ 生成机会」手动跑一轮）</p>
              ) : (
                <div className="admin-list">
                  {opportunityDrafts.map((o) => (
                    <div key={o.id} className="admin-item weekly">
                      {editing?.type === 'opportunity' && editing.id === o.id ? (
                        /* ─── 机会编辑表单 ─── */
                        <div className="admin-edit-form">
                          <label className="admin-field">
                            <span>标题</span>
                            <input
                              value={String(editForm.title ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            />
                          </label>
                          <label className="admin-field">
                            <span>机会论断（thesis）</span>
                            <textarea
                              rows={2}
                              value={String(editForm.thesis ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, thesis: e.target.value })}
                            />
                          </label>
                          <label className="admin-field">
                            <span>主编点评（editor_take）</span>
                            <textarea
                              rows={3}
                              value={String(editForm.editor_take ?? '')}
                              onChange={(e) => setEditForm({ ...editForm, editor_take: e.target.value })}
                            />
                          </label>
                          <div className="admin-field-row">
                            <label className="admin-field">
                              <span>建议结论（你来拍板）</span>
                              <select
                                value={String(editForm.recommendation ?? 'WATCH')}
                                onChange={(e) => setEditForm({ ...editForm, recommendation: e.target.value })}
                              >
                                <option value="BUILD">立即动手</option>
                                <option value="WATCH">保持关注</option>
                                <option value="NICHE_ONLY">垂直切入</option>
                                <option value="SKIP">不建议</option>
                              </select>
                            </label>
                            <label className="admin-field">
                              <span>主编信心</span>
                              <select
                                value={String(editForm.editor_conviction ?? 'medium')}
                                onChange={(e) => setEditForm({ ...editForm, editor_conviction: e.target.value })}
                              >
                                <option value="high">高</option>
                                <option value="medium">中</option>
                                <option value="low">低</option>
                              </select>
                            </label>
                            <label className="admin-field">
                              <span>分类</span>
                              <input
                                value={String(editForm.category ?? '')}
                                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              />
                            </label>
                          </div>
                          <div className="admin-edit-btns">
                            <button className="admin-btn primary" disabled={busy} onClick={() => void saveEdit(true)}>
                              保存并发布
                            </button>
                            <button className="admin-btn" disabled={busy} onClick={() => void saveEdit(false)}>
                              仅保存
                            </button>
                            <button className="admin-btn" disabled={busy} onClick={cancelEdit}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="admin-item-main">
                            <div className="admin-item-body">
                              <span className="admin-item-title-row">
                                <span className="admin-score">{o.score_total ?? '–'}</span>
                                <span className="admin-item-title">{o.title}</span>
                              </span>
                              <span className="admin-item-meta">
                                证据 {o.evidence_grade || '–'} 级 · {RECOMMENDATION_MAP[o.recommendation as keyof typeof RECOMMENDATION_MAP]?.label || o.recommendation || '–'}
                                {o.editor_conviction ? ` · 信心 ${CONVICTION_MAP[o.editor_conviction as keyof typeof CONVICTION_MAP] || o.editor_conviction}` : ''}
                                {o.category ? ` · ${CATEGORY_MAP[o.category as keyof typeof CATEGORY_MAP]?.label || o.category}` : ''} · {o.created_at?.slice(0, 10)}
                              </span>
                              {o.thesis && <span className="admin-item-reason">✦ {o.thesis}</span>}
                              <button
                                type="button"
                                className="admin-note-toggle"
                                onClick={() => toggleSet(setExpandedOpp, o.id)}
                              >
                                {expandedOpp.has(o.id) ? '收起详情 ▲' : `详情与证据（${o.evidence?.length || 0} 条）▼`}
                              </button>
                              {expandedOpp.has(o.id) && (
                                <span className="admin-item-note">
                                  {o.editor_take && <span style={{ display: 'block', marginBottom: 8 }}>🖊 {o.editor_take}</span>}
                                  {(o.evidence || []).map((ev, i) => (
                                    <span key={i} style={{ display: 'block', marginBottom: 4 }}>
                                      [{ev.tier || '?'}] <a href={ev.source_url} target="_blank" rel="noopener noreferrer">{ev.source_name || ev.source_url}</a>
                                      {ev.claim ? ` — ${ev.claim}` : ''}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="admin-item-btns">
                            <button
                              className="admin-btn sm"
                              disabled={busy}
                              onClick={() =>
                                startEdit('opportunity', o.id, {
                                  title: o.title,
                                  thesis: o.thesis || '',
                                  editor_take: o.editor_take || '',
                                  recommendation: o.recommendation || 'WATCH',
                                  editor_conviction: o.editor_conviction || 'medium',
                                  category: o.category || '',
                                })
                              }
                            >
                              编辑
                            </button>
                            <button
                              className="admin-btn primary sm"
                              disabled={busy}
                              onClick={() => void act('publish', 'opportunity', [o.id])}
                            >
                              发布
                            </button>
                            <button
                              className="admin-btn danger sm"
                              disabled={busy}
                              onClick={() => void act('discard', 'opportunity', [o.id])}
                            >
                              丢弃
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- 弃选记录 ---------- */}
            <section className="admin-section">
              <div className="admin-section-head">
                <h2>
                  弃选记录（近 7 天） <span className="admin-count">{radarRejected.length}</span>
                </h2>
                {radarRejected.length > 0 && (
                  <div className="admin-actions">
                    <button
                      className="admin-btn danger"
                      disabled={busy}
                      onClick={() =>
                        void act('discard', 'radar', radarRejected.map((r) => r.id))
                      }
                    >
                      清空全部弃选
                    </button>
                  </div>
                )}
              </div>
              {radarRejected.length === 0 ? (
                <p className="admin-empty">没有弃选记录</p>
              ) : (
                <div className="admin-list">
                  {radarRejected.map((r) => (
                    <div key={r.id} className="admin-item">
                      <div className="admin-item-main">
                        <div className="admin-item-body">
                          <span className="admin-item-title-row">
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="admin-item-title"
                            >
                              {r.title}
                            </a>
                          </span>
                          <span className="admin-item-meta">
                            {r.source_name} · {r.published_at}
                          </span>
                          {r.reject_reason && (
                            <span className="admin-item-reason">✕ {r.reject_reason}</span>
                          )}
                        </div>
                      </div>
                      <div className="admin-item-btns">
                        <button
                          className="admin-btn danger sm"
                          disabled={busy}
                          onClick={() => void act('discard', 'radar', [r.id])}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
