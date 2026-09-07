'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/page-shell';
import { RECOMMENDATION_MAP, CONVICTION_MAP, CATEGORY_MAP } from '@/lib/types';
import { LineIcon } from '@/components/icons';
import { AdminAnalytics } from '@/components/admin-analytics';
import { AdminPublished } from '@/components/admin-published';
import { sourceCoverageGrade } from '@/lib/evidence-policy.mjs';

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
  evidence: { claim?: string; source_name?: string; source_url?: string; quote?: string; tier?: string; role?: string; relevance_note?: string; quote_verified_at?: string }[] | null;
  created_at: string;
  featured?: boolean;
  published_at?: string;
  cover_url?: string | null;
};

export default function AdminPage() {
  const [view, setView] = useState<'pending' | 'overview' | 'published'>('pending');
  const [pendingType, setPendingType] = useState<'radar' | 'opportunity' | 'weekly'>('radar');
  const [publishedDirty, setPublishedDirty] = useState(false);
  const [publishedBusy, setPublishedBusy] = useState(false);
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

  const load = useCallback(async (t: string, keepMessage = false) => {
    setLoading(true);
    if (!keepMessage) setMessage('');
    try {
      const res = await fetch('/api/admin/review', {
        headers: { 'x-admin-token': t },
        cache: 'no-store',
      });
      if (res.status === 401) {
        localStorage.removeItem('ai_opc_admin_token');
        await fetch('/api/admin/session', { method: 'DELETE' });
        window.dispatchEvent(new Event('aiopc-admin-session-change'));
        setAuthed(false);
        setMessage('密码错误，请重新输入');
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '加载失败');
        return;
      }
      const sessionResponse = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'x-admin-token': t },
        cache: 'no-store',
      });
      if (!sessionResponse.ok) {
        setAuthed(false);
        setMessage('管理员会话建立失败，请重新登录');
        return;
      }
      setRadarDrafts(data.radarDrafts || []);
      setWeeklyDrafts(data.weeklyDrafts || []);
      setRadarRejected(data.radarRejected || []);
      setOpportunityDrafts(data.opportunityDrafts || []);
      setSelected(new Set());
      setAuthed(true);
      window.dispatchEvent(new Event('aiopc-admin-session-change'));
    } catch {
      setMessage('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = localStorage.getItem('ai_opc_admin_token');
      if (saved) {
        setToken(saved);
        void load(saved);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, [load]);

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordInput) return;
    localStorage.setItem('ai_opc_admin_token', passwordInput);
    setToken(passwordInput);
    void load(passwordInput);
  }

  async function logout() {
    if (busy || publishedBusy || ((editing || publishedDirty) && !confirm('编辑尚未保存，确认退出并放弃修改？'))) return;
    localStorage.removeItem('ai_opc_admin_token');
    await fetch('/api/admin/session', { method: 'DELETE' });
    setToken('');
    setAuthed(false);
    setPasswordInput('');
    setMessage('');
    setView('pending'); setEditing(null); setPublishedDirty(false);
    window.dispatchEvent(new Event('aiopc-admin-session-change'));
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

  async function act(
    action: 'publish' | 'discard' | 'unpublish' | 'feature' | 'unfeature',
    type: 'radar' | 'weekly' | 'news_item' | 'opportunity',
    ids: string[],
    discardConfirm?: string,
  ) {
    if (ids.length === 0 || busy) return;
    if (action === 'publish' && discardConfirm && !window.confirm(discardConfirm)) return;
    if (action === 'discard' && !window.confirm(discardConfirm || `确认删除 ${ids.length} 条？此操作不可恢复。`)) return;
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
            ? `已发布 ${data.affected} 条（前台即时生效）`
            : action === 'unpublish'
              ? `已下架 ${data.affected} 条（已退回草稿区）`
              : action === 'feature'
                ? `已设为首页推荐`
                : action === 'unfeature'
                  ? `已取消首页推荐`
                  : type === 'news_item'
                    ? `已删除 ${data.affected} 条周报资讯，整期已保留；需要替换时可点「生成周报」自动补齐`
                    : `已删除 ${data.affected} 条`,
        );
        await revalidateSite();
        await load(token, true);
      }
    } catch {
      setMessage('网络错误');
    } finally {
      setBusy(false);
    }
  }

  async function trigger(workflow: 'daily-radar' | 'weekly-newsletter' | 'weekly-opportunities', opts?: { rescoreOnly?: boolean }) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ workflow, rescore_only: opts?.rescoreOnly === true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '触发失败');
      } else {
        setMessage(
          workflow === 'daily-radar'
            ? '已触发雷达抓取 + 生成，约 2–3 分钟后点「刷新」查看新草稿'
            : workflow === 'weekly-newsletter'
              ? '已触发周报生成，约 3–5 分钟后点「刷新」查看草稿'
              : opts?.rescoreOnly
                ? '已触发评分复评，约 1–2 分钟完成，结果见机会详情页「评分轨迹」'
                : '已触发机会生产线，约 3–5 分钟后点「刷新」查看机会草稿',
        );
      }
    } catch {
      setMessage('网络错误');
    } finally {
      setBusy(false);
    }
  }

  // 为单个机会重新生成/补生成封面：dispatch backfill-covers.yml（clear=slug 先置 NULL 再回填），
  // 覆盖 GLM 429 等瞬时失败留下的无封面记录（2026-08-20 本地AI开发工具事件的自助补救入口）
  async function recoverCover(slug: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ workflow: 'backfill-covers', clear: slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '触发失败');
      } else {
        setMessage(`已触发封面生成（${slug}），约 1–2 分钟后点「刷新」查看`);
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
      if (!res.ok || data.affected === 0) {
        setMessage(data.error || '保存失败');
        return;
      }
      const editId = editing.id;
      const editType = editing.type;
      cancelEdit();
      if (thenPublish) {
        await act('publish', editType, [editId]); // act 内部会 reload
      } else {
        setMessage('已保存');
        await load(token, true);
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

  const pendingCount = radarDrafts.length + opportunityDrafts.length + weeklyDrafts.length;
  function switchView(next: typeof view) {
    if (next === view || busy || publishedBusy) return;
    if ((editing || publishedDirty) && !confirm('编辑尚未保存，确认切换并放弃修改？')) return;
    cancelEdit(); setPublishedDirty(false); setSelected(new Set()); setView(next);
  }
  function switchPending(next: typeof pendingType) {
    if (next === pendingType || busy) return;
    if (editing && !confirm('编辑尚未保存，确认切换并放弃修改？')) return;
    cancelEdit(); setSelected(new Set()); setPendingType(next);
  }
  useEffect(() => {
    if (!editing && !publishedDirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [editing, publishedDirty]);

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
            <div className="admin-console-header">
              <div><p className="product-eyebrow">AI OPC · 管理后台</p><h1>内容工作台</h1><p className="analytics-note">待审核 {pendingCount} 项 · 跨天待办持续保留</p></div>
              <div className="admin-actions">
                <details className="admin-content-operations">
                  <summary className="admin-btn"><LineIcon name="settings" /> 内容操作</summary>
                  <div className="admin-operation-menu">
                    <button className="admin-btn" disabled={busy || publishedBusy} onClick={() => void trigger('daily-radar')}>拉取每日信号</button>
                    <button className="admin-btn" disabled={busy || publishedBusy} onClick={() => void trigger('weekly-newsletter')}>生成周报</button>
                    <button className="admin-btn" disabled={busy || publishedBusy} onClick={() => void trigger('weekly-opportunities')}>生成机会</button>
                    <button className="admin-btn" disabled={busy || publishedBusy} onClick={() => void trigger('weekly-opportunities', { rescoreOnly: true })}>复评评分</button>
                    <Link className="admin-btn" href="/tools">工具预览</Link>
                  </div>
                </details>
                <button className="admin-btn" onClick={() => void logout()} disabled={busy || publishedBusy}>退出</button>
              </div>
            </div>
            <div className="admin-workspace">
              <nav className="admin-workspace-nav" aria-label="管理后台栏目">
                <button aria-current={view === 'overview' ? 'page' : undefined} disabled={busy || publishedBusy} onClick={() => switchView('overview')}><LineIcon name="trending-up" /> 数据概览</button>
                <button aria-current={view === 'pending' ? 'page' : undefined} disabled={busy || publishedBusy} onClick={() => switchView('pending')}><LineIcon name="clipboard" /> 待审核 <span className="admin-count">{pendingCount}</span></button>
                <button aria-current={view === 'published' ? 'page' : undefined} disabled={busy || publishedBusy} onClick={() => switchView('published')}><LineIcon name="archive" /> 已发布</button>
              </nav>
              <div className="admin-workspace-main">
                {message && <p className="admin-msg" role="status">{message}</p>}
                {view === 'overview' && <AdminAnalytics />}
                {view === 'published' && <><h2 className="admin-view-title">已发布内容</h2><AdminPublished token={token} externalBusy={busy} onChanged={() => void load(token, true)} onDirtyChange={setPublishedDirty} onBusyChange={setPublishedBusy} /></>}
                {view === 'pending' && <>
                  <div className="admin-section-head"><h2 className="admin-view-title">待审核</h2><button className="admin-btn" disabled={loading || busy} onClick={() => { if (editing && !confirm('编辑尚未保存，确认刷新并放弃修改？')) return; cancelEdit(); void load(token); }}>{loading ? '刷新中…' : '刷新待办'}</button></div>
                  <div className="admin-filter-tabs" role="group" aria-label="待审核内容类型">
                    <button className="admin-btn" aria-pressed={pendingType === 'radar'} disabled={busy} onClick={() => switchPending('radar')}>每日信号 · {radarDrafts.length}</button>
                    <button className="admin-btn" aria-pressed={pendingType === 'opportunity'} disabled={busy} onClick={() => switchPending('opportunity')}>机会 · {opportunityDrafts.length}</button>
                    <button className="admin-btn" aria-pressed={pendingType === 'weekly'} disabled={busy} onClick={() => switchPending('weekly')}>周报 · {weeklyDrafts.length}</button>
                  </div>
                  {pendingType === 'radar' &&
            <section className="admin-section">
              <div className="admin-section-head">
                <h2>
                  每日信号草稿 <span className="admin-count">{radarDrafts.length}</span>
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
                                <span className="admin-item-reason"><LineIcon name="sparkles" /> {d.pick_reason}</span>
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

            }
            {/* ---------- 周报草稿 ---------- */}
            {pendingType === 'weekly' &&
            <section className="admin-section">
              <div className="admin-section-head">
                <h2>
                  周报草稿 <span className="admin-count">{weeklyDrafts.length}</span>
                </h2>
                <button className="admin-btn primary" disabled={busy || weeklyDrafts.length === 0} onClick={() => void act('publish', 'weekly', weeklyDrafts.map(w => w.id))}>全部发布</button>
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
                                      <span className="admin-weekly-item-text">
                                        <em>{it.section}</em> {it.title}
                                      </span>
                                      <button
                                        type="button"
                                        className="admin-weekly-item-delete"
                                        disabled={busy}
                                        aria-label={`删除周报条目：${it.title}`}
                                        title="只删除本条，保留整期周报"
                                        onClick={() => void act(
                                          'discard',
                                          'news_item',
                                          [it.id],
                                          `确认删除「${it.title}」？\n\n只会删除这一条，整期周报会保留。此操作不可恢复。`,
                                        )}
                                      >
                                        删除本条
                                      </button>
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

            }
            {/* ---------- 机会草稿（Opportunities） ---------- */}
            {pendingType === 'opportunity' &&
            <section className="admin-section">
              <p className="trust-note">发布前请逐条核对：原文是否支持该判断、客户与应用场景是否一致、跨行业材料是否仅作背景、收入是否有出处、验证步骤是否与时间承诺一致。自动匹配摘录不能代替关联性审核。</p>
              <div className="admin-section-head">
                <h2>
                  机会草稿 <span className="admin-count">{opportunityDrafts.length}</span>
                </h2>
                {opportunityDrafts.length > 0 && (
                  <div className="admin-actions">
                    <button className="admin-btn primary" disabled={busy} onClick={() => void act('publish', 'opportunity', opportunityDrafts.map(o => o.id), '确认已逐条核对证据，发布全部机会草稿？')}>全部发布</button>
                    <button
                      className="admin-btn danger"
                      disabled={busy}
                      onClick={() => void act('discard', 'opportunity', opportunityDrafts.map((o) => o.id))}
                    >
                      删除全部草稿（{opportunityDrafts.length}）
                    </button>
                  </div>
                )}
              </div>
              {opportunityDrafts.length === 0 ? (
                <p className="admin-empty">没有待审核的机会，可从「内容操作 → 生成机会」手动生成</p>
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
                                来源组合 {sourceCoverageGrade(o.evidence)} 级 · {RECOMMENDATION_MAP[o.recommendation as keyof typeof RECOMMENDATION_MAP]?.label || o.recommendation || '–'}
                                {o.editor_conviction ? ` · 信心 ${CONVICTION_MAP[o.editor_conviction as keyof typeof CONVICTION_MAP] || o.editor_conviction}` : ''}
                                {o.category ? ` · ${CATEGORY_MAP[o.category as keyof typeof CATEGORY_MAP]?.label || o.category}` : ''} · {o.created_at?.slice(0, 10)}
                              </span>
                              {o.thesis && <span className="admin-item-reason"><LineIcon name="sparkles" /> {o.thesis}</span>}
                              <button
                                type="button"
                                className="admin-note-toggle"
                                onClick={() => toggleSet(setExpandedOpp, o.id)}
                              >
                                {expandedOpp.has(o.id) ? '收起详情 ▲' : `详情与证据（${o.evidence?.length || 0} 条）▼`}
                              </button>
                              {expandedOpp.has(o.id) && (
                                <span className="admin-item-note">
                                  {o.editor_take && <span style={{ display: 'block', marginBottom: 8 }}><LineIcon name="pen" /> {o.editor_take}</span>}
                                  {(o.evidence || []).map((ev, i) => (
                                    <span key={i} style={{ display: 'block', marginBottom: 4 }}>
                                      [{ev.tier || '?'}] <a href={ev.source_url} target="_blank" rel="noopener noreferrer">{ev.source_name || ev.source_url}</a>
                                      {ev.claim ? ` — ${ev.claim}` : ''}
                                      <span style={{ display: 'block' }}>摘录：{ev.quote || '无原文摘录'} · {ev.quote_verified_at ? `自动匹配 ${ev.quote_verified_at.slice(0, 10)}` : '尚无核对记录'}</span>
                                      <span style={{ display: 'block' }}>用途（模型分类）：{ev.role || '待复核'} · {ev.relevance_note || '尚无关联解释，请核对目标客户和适用场景'}</span>
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
                              title={o.cover_url ? '清空现有封面并重新生成' : '封面缺失，点击生成'}
                              onClick={() => void recoverCover(o.slug)}
                            >
                              <LineIcon name="palette" /> {o.cover_url ? '重生成封面' : '补封面'}
                            </button>
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
                              删除
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            }
            {/* ---------- 弃选记录 ---------- */}
            <details className="admin-rejected"><summary>弃选记录 · 近 7 天（{radarRejected.length}）</summary>
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
                            <span className="admin-item-reason"><LineIcon name="x" /> {r.reject_reason}</span>
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
            </details>
            </>}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
