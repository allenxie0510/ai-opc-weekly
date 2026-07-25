'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/page-shell';

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
  issue_no: number;
  title: string;
  summary: string;
  published_at: string;
  items: { id: string; title: string; section: string; rank: number }[];
};

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [radarDrafts, setRadarDrafts] = useState<RadarDraft[]>([]);
  const [weeklyDrafts, setWeeklyDrafts] = useState<WeeklyDraft[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedNote, setExpandedNote] = useState<Set<string>>(new Set());
  const [expandedIssue, setExpandedIssue] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async (t: string) => {
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/review', {
        headers: { 'x-admin-token': t },
        cache: 'no-store',
      });
      if (res.status === 401) {
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

  async function act(action: 'publish' | 'discard', type: 'radar' | 'weekly', ids: string[]) {
    if (ids.length === 0 || busy) return;
    if (action === 'discard' && !window.confirm(`确认丢弃 ${ids.length} 条？不可恢复。`)) return;
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
          action === 'publish' ? `已发布 ${data.affected} 条 ✓` : `已丢弃 ${data.affected} 条`,
        );
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
      <main className="page admin-page">
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
              <button className="admin-btn" onClick={() => void load(token)} disabled={loading}>
                {loading ? '刷新中…' : '刷新'}
              </button>
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
                      <div className="admin-item-main">
                        <div className="admin-item-body">
                          <span className="admin-item-title-row">
                            <span className="admin-score">#{w.issue_no}</span>
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
