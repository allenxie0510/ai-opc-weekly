'use client';

/**
 * Notion 式就地编辑按钮（仅管理员可见）
 * - 普通访客 localStorage 无 token → 渲染 null，页面零变化
 * - 管理员（曾在 /admin 登录，localStorage 有 ai_opc_admin_token）→ 卡片右上角出现 ✎
 * - 点击弹出编辑浮层，保存后 router.refresh() 刷新服务端数据
 * - 401 时浮层内直接重新输入密码，不用跳页
 * - radar / weekly 类型附带「下架」（退回草稿区，前台不可见）
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type FieldType = 'text' | 'textarea' | 'number' | 'select';

type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  rows?: number;
  options?: string[];
};

const CATEGORY_OPTIONS = [
  'micro-saas',
  'design-assets',
  'automation',
  'content-monetize',
  'indie-tool',
  'digital-product',
];

const FIELD_DEFS: Record<string, FieldDef[]> = {
  radar: [
    { key: 'title', label: '标题', type: 'text' },
    { key: 'summary', label: '摘要', type: 'textarea', rows: 3 },
    { key: 'editor_note', label: '编辑点评', type: 'textarea', rows: 3 },
    { key: 'score', label: '评分（0–100）', type: 'number' },
    { key: 'pick_reason', label: '收录理由', type: 'text' },
    { key: 'category', label: '分类', type: 'select', options: CATEGORY_OPTIONS },
  ],
  news_item: [
    { key: 'title', label: '标题', type: 'text' },
    { key: 'description', label: '描述', type: 'textarea', rows: 4 },
    { key: 'insight', label: '编辑判断/点评', type: 'textarea', rows: 4 },
    { key: 'mrr_range', label: '单人 MRR', type: 'text' },
    { key: 'pricing', label: '定价', type: 'text' },
    { key: 'mvp_time', label: 'MVP 周期', type: 'text' },
  ],
  weekly: [
    { key: 'title', label: '标题', type: 'text' },
    { key: 'summary', label: '摘要', type: 'textarea', rows: 4 },
  ],
};

export function AdminEditButton({
  type,
  id,
  initial,
}: {
  type: 'radar' | 'news_item' | 'weekly';
  id: string;
  initial: Record<string, string | number>;
}) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string | number>>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    setIsAdmin(!!localStorage.getItem('ai_opc_admin_token'));
  }, []);

  if (!isAdmin) return null;

  async function save() {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': localStorage.getItem('ai_opc_admin_token') || '',
        },
        body: JSON.stringify({ type, id, fields: form }),
      });
      const data = await res.json();
      if (res.status === 401) {
        localStorage.removeItem('ai_opc_admin_token');
        setNeedPassword(true);
        setMsg('登录已失效，请重新输入管理密码');
        return;
      }
      if (!res.ok) {
        setMsg(data.error || '保存失败');
        return;
      }
      setOpen(false);
      router.refresh(); // ISR 页面最长 5 分钟内生效
    } catch {
      setMsg('网络错误');
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (busy || !window.confirm('确认下架？前台将不可见，可在 /admin 草稿区重新发布。')) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': localStorage.getItem('ai_opc_admin_token') || '',
        },
        body: JSON.stringify({ action: 'unpublish', type, ids: [id] }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || '下架失败');
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setMsg('网络错误');
    } finally {
      setBusy(false);
    }
  }

  function relogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    localStorage.setItem('ai_opc_admin_token', password);
    setNeedPassword(false);
    setPassword('');
    setMsg('已重新登录，请再次点击保存');
  }

  return (
    <>
      <button
        type="button"
        className="admin-inline-edit"
        title="编辑（仅管理员可见）"
        aria-label="编辑此条目"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setForm(initial);
          setMsg('');
          setOpen(true);
        }}
      >
        ✎
      </button>

      {open && (
        <div
          className="admin-modal-mask"
          onClick={() => !busy && setOpen(false)}
          role="presentation"
        >
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
            <div className="admin-modal-head">
              <strong>编辑内容</strong>
              <button type="button" className="admin-modal-close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            {needPassword ? (
              <form className="admin-field" onSubmit={relogin}>
                <span>管理密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="admin-btn primary" style={{ marginTop: 8 }}>
                  重新登录
                </button>
              </form>
            ) : (
              <>
                {FIELD_DEFS[type].map((f) => (
                  <label key={f.key} className="admin-field">
                    <span>{f.label}</span>
                    {f.type === 'textarea' ? (
                      <textarea
                        rows={f.rows || 3}
                        value={String(form[f.key] ?? '')}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        value={String(form[f.key] ?? '')}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      >
                        {f.options?.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        min={f.type === 'number' ? 0 : undefined}
                        max={f.type === 'number' ? 100 : undefined}
                        value={String(form[f.key] ?? '')}
                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      />
                    )}
                  </label>
                ))}

                <div className="admin-edit-btns" style={{ marginTop: 12 }}>
                  <button type="button" className="admin-btn primary" disabled={busy} onClick={() => void save()}>
                    {busy ? '保存中…' : '保存'}
                  </button>
                  {(type === 'radar' || type === 'weekly') && (
                    <button type="button" className="admin-btn danger" disabled={busy} onClick={() => void unpublish()}>
                      下架
                    </button>
                  )}
                  <button type="button" className="admin-btn" disabled={busy} onClick={() => setOpen(false)}>
                    取消
                  </button>
                </div>
                <p className="admin-modal-hint">保存后前台最长约 5 分钟生效（页面缓存）</p>
              </>
            )}
            {msg && <p className="admin-msg">{msg}</p>}
          </div>
        </div>
      )}
    </>
  );
}
