'use client';

import { useEffect, useRef, useState } from 'react';

type Pipeline = { key: string; label: string; schedule: string; pending: number; state: string; message: string; runId?: number; startedAt?: string; finishedAt?: string };
const labels: Record<string, string> = { running: '执行中', cancelled: '已取消', failed: '执行异常', delivered: '已有新增', empty: '本轮无新增整项', unavailable: '状态暂不可用', 'not-run': '尚未运行' };

export function AdminPipeline({ token, refreshKey, onComplete }: { token: string; refreshKey: number; onComplete: () => void }) {
  const [rows, setRows] = useState<Pipeline[]>([]);
  const [error, setError] = useState('');
  const previous = useRef<string | null>(null);
  const callback = useRef(onComplete);
  useEffect(() => { callback.current = onComplete; }, [onComplete]);
  useEffect(() => {
    let stopped = false;
    let pending = false;
    async function update() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch('/api/admin/pipeline', { headers: { 'x-admin-token': token }, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '状态读取失败');
        if (stopped) return;
        const next: Pipeline[] = data.pipelines;
        const signature = JSON.stringify(next.map(row => [row.runId, row.state, row.pending]));
        if (previous.current !== null && previous.current !== signature && next.some(row => row.state === 'delivered' || row.state === 'empty' || row.state === 'failed')) callback.current();
        previous.current = signature;
        setRows(next); setError('');
      } catch (err) { if (!stopped) setError(err instanceof Error ? err.message : '状态读取失败'); }
      finally { pending = false; }
    }
    void update();
    const interval = window.setInterval(() => void update(), 60000);
    document.addEventListener('visibilitychange', update);
    return () => { stopped = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', update); };
  }, [token, refreshKey]);
  return <section className="admin-pipeline" aria-label="内容推送状态">
    <h2>内容推送状态</h2>
    <p className="admin-item-meta">定时任务生成后直接送到本后台待审核，无需打开 GitHub。执行完成不等于有新草稿；每分钟自动检查。</p>
    {error && <p role="status">{error}</p>}
    <div className="admin-pipeline-grid">{rows.map(row => <article key={row.key}>
      <h3>{row.label} <span>{labels[row.state]}</span></h3>
      <p>{row.message}</p>
      <p className="admin-item-meta">{row.schedule}</p>
      {row.startedAt && <p className="admin-item-meta">最近启动：{new Date(row.startedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间）</p>}
    </article>)}</div>
  </section>;
}
