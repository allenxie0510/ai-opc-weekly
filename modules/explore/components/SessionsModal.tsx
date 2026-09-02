import { useEffect, useState } from 'react';
import type { ExploreSession } from '../lib/types';
import { Button, Modal } from './ui';
import { LineIcon } from '@/components/icons';

export function SessionsModal({
  open,
  sessions,
  currentSessionId,
  onClose,
  onSave,
  onLoad,
  onDelete,
  onNew,
  onOpenConfig,
}: {
  open: boolean;
  sessions: ExploreSession[];
  currentSessionId: string | null;
  onClose: () => void;
  onSave: (title: string) => void;
  onLoad: (s: ExploreSession) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onOpenConfig?: () => void;
}) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (open) setTitle('');
  }, [open]);

  function fmt(d: string) {
    try {
      return new Date(d).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  return (
    <Modal open={open} title="我的探索" onClose={onClose}>
      <div className="xpl-sessions">
        <div className="xpl-session-save">
          <input
            className="xpl-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`给这次探索起个名字（如：${new Date().toLocaleDateString('zh-CN')} 出海方向）`}
          />
          <div className="xpl-detail-actions" style={{ marginTop: 8 }}>
            <Button small onClick={() => onSave(title)}><LineIcon name="save" /> 保存当前探索</Button>
            <Button small variant="ghost" onClick={onNew}><LineIcon name="plus" /> 新建空白探索</Button>
            {onOpenConfig && (
              <Button small variant="ghost" onClick={onOpenConfig}><LineIcon name="settings" /> AI 设置</Button>
            )}
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="xpl-small" style={{ marginTop: 12 }}>
            还没有保存过的探索。完成一组「定方向 → 生成 → 筛选 → 规划」后，点上方「保存当前探索」。
          </p>
        ) : (
          <div className="xpl-session-list">
            {sessions.map((s) => (
              <div key={s.id} className={`xpl-session-item ${s.id === currentSessionId ? 'current' : ''}`}>
                <div className="xpl-session-info">
                  <strong>{s.title}</strong>
                  <span className="xpl-small">
                    {fmt(s.updated_at)} · {s.opportunities?.length ?? 0} 个候选 · {Object.keys(s.plans || {}).length} 份规划
                  </span>
                </div>
                <div className="xpl-detail-actions">
                  <Button small variant="outline" onClick={() => { onLoad(s); onClose(); }}>加载</Button>
                  <Button small variant="danger" onClick={() => onDelete(s.id)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
