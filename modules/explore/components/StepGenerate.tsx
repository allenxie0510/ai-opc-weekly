import { useState } from 'react';
import type { AIConfig, Opportunity, PlansMap, ThemeProfile } from '../lib/types';
import { ai, isMock } from '../lib/ai';
import { computeTotal, grade } from '../lib/scoring';
import { Button, Head, Modal, Pill } from './ui';

const PRESETS = [50, 100, 200];
type StatusFilter = 'all' | 'favorite' | 'rejected';
type SourceFilter = 'all' | 'mock' | 'ai';

export function StepGenerate({
  config,
  profile,
  opportunities,
  plans,
  onReplace,
  onAppend,
  onPatch,
  onDelete,
  onNext,
}: {
  config: AIConfig;
  profile: ThemeProfile;
  opportunities: Opportunity[];
  plans: PlansMap;
  onReplace: (list: Opportunity[]) => void;
  onAppend: (list: Opportunity[]) => void;
  onPatch: (id: string, patch: Partial<Opportunity>) => void;
  onDelete: (ids: string[]) => void;
  onNext: () => void;
}) {
  const [count, setCount] = useState(100);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  async function generate() {
    setRunning(true);
    setError('');
    setProgress({ done: 0, total: count });
    try {
      let firstBatch = true;
      await ai.generateOpportunities(config, profile, count, 12, (p) => {
        if (firstBatch) {
          onReplace(p.batch);
          firstBatch = false;
        } else {
          onAppend(p.batch);
        }
        setProgress({ done: p.done, total: p.total });
      });
    } catch (e: any) {
      setError(e?.message || '生成失败');
    } finally {
      setRunning(false);
    }
  }

  const filtered = opportunities.filter((o) => {
    if (sourceFilter !== 'all' && o.source !== sourceFilter) return false;
    if (filter === 'favorite') return o.status === 'favorite';
    if (filter === 'rejected') return o.status === 'rejected';
    return true;
  });

  const mockCount = opportunities.filter((o) => o.source === 'mock').length;
  const aiCount = opportunities.filter((o) => o.source === 'ai').length;
  const statusCount = (s: Opportunity['status']) => opportunities.filter((o) => o.status === s).length;

  function toggleSel(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function selectAllVisible() {
    setSelected((prev) => {
      const n = new Set(prev);
      filtered.forEach((o) => n.add(o.id));
      return n;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }
  function del(ids: string[], label: string) {
    const uniq = Array.from(new Set(ids));
    if (uniq.length === 0) return;
    if (!confirm(`确定删除 ${label}（共 ${uniq.length} 个候选）？此操作不可撤销。`)) return;
    onDelete(uniq);
    setSelected((prev) => {
      const n = new Set(prev);
      uniq.forEach((id) => n.delete(id));
      return n;
    });
    setBulkOpen(false);
  }
  function deleteAll() {
    const ids = opportunities.map((o) => o.id);
    if (!confirm(`⚠️ 确定清空全部 ${ids.length} 个候选？真实数据与演示数据会一起删除，不可撤销。`)) return;
    onDelete(ids);
    setSelected(new Set());
    setBulkOpen(false);
  }

  return (
    <div className="xpl-panel">
      <Head
        kicker="第二步 · 海量生成"
        title="把候选事业数量拉到孙正义做不到的量级"
        desc={`孙正义年轻时手抄了 25–40 个候选事业；AI 时代，你可以一次生成 ${count} 个、覆盖数十个大类。量要大、面要广，筛选才有意义。`}
      />

      <div className="xpl-gen-controls">
        <div className="xpl-seg">
          {PRESETS.map((n) => (
            <button key={n} className={count === n ? 'xpl-on' : ''} onClick={() => setCount(n)} disabled={running}>
              {n} 个
            </button>
          ))}
        </div>
        <Button onClick={generate} disabled={running}>
          {running ? '正在生成…' : '🚀 开始海量生成'}
        </Button>
        {running && (
          <div className="xpl-progress">
            <div className="xpl-progress-track">
              <div className="xpl-progress-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <span className="xpl-progress-text">{progress.done} / {progress.total}</span>
          </div>
        )}
        {isMock(config) && !running && (
          <span className="xpl-muted">演示模式（未配置 API Key）——用内置样本模拟生成。右上角「AI 设置」可接入真实模型。</span>
        )}
        {!running && (
          <span className="xpl-muted">每次生成都会建立与当前方向一致的新候选池，不会混入旧方向结果。</span>
        )}
      </div>

      {error && <div className="xpl-error">{error}</div>}

      {opportunities.length > 0 && (
        <>
          <div className="xpl-toolbar">
            <div className="xpl-seg">
              <button className={filter === 'all' ? 'xpl-on' : ''} onClick={() => setFilter('all')}>
                全部 ({opportunities.length})
              </button>
              <button className={filter === 'favorite' ? 'xpl-on' : ''} onClick={() => setFilter('favorite')}>
                ⭐ 收藏 ({statusCount('favorite')})
              </button>
              <button className={filter === 'rejected' ? 'xpl-on' : ''} onClick={() => setFilter('rejected')}>
                ✕ 否决 ({statusCount('rejected')})
              </button>
            </div>
            <select className="xpl-select xpl-search" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
              <option value="all">来源：全部</option>
              <option value="mock">来源：演示数据 ({mockCount})</option>
              <option value="ai">来源：真实 AI ({aiCount})</option>
            </select>
            <Button small variant="danger" onClick={() => setBulkOpen(true)}>
              🗑 批量删除…
            </Button>
          </div>

          {selected.size > 0 && (
            <div className="xpl-selbar">
              <span className="xpl-muted">已选 {selected.size} 个</span>
              <Button small variant="outline" onClick={selectAllVisible}>全选当前列表</Button>
              <Button small variant="ghost" onClick={clearSelection}>清除选择</Button>
              <Button small variant="danger" onClick={() => del(Array.from(selected), '选中的候选')}>删除选中</Button>
            </div>
          )}

          <div className="xpl-cardgrid">
            {filtered.map((o) => {
              const g = grade(computeTotal(o));
              return (
                <div key={o.id} className={`xpl-card status-${o.status} ${selected.has(o.id) ? 'selected' : ''}`}>
                  <div className="xpl-card-head">
                    <label className="xpl-card-check" title="勾选以批量删除">
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSel(o.id)} />
                    </label>
                    <h3 className="xpl-card-title">{o.name}</h3>
                    <span className={`xpl-grade ${g.cls}`}>{g.label}</span>
                  </div>
                  <p className="xpl-card-liner">{o.oneLiner}</p>
                  <div className="xpl-card-tags">
                    <Pill>{o.category}</Pill>
                    <Pill tone={o.source === 'mock' ? 'warn' : 'blue'}>{o.source === 'mock' ? '演示数据' : '真实 AI'}</Pill>
                    <Pill tone={o.capitalNeed === '低' ? 'good' : o.capitalNeed === '中' ? 'warn' : 'bad'}>资金{o.capitalNeed}</Pill>
                    <Pill tone={o.competition === '低' ? 'good' : o.competition === '中' ? 'warn' : 'bad'}>竞争{o.competition}</Pill>
                    {plans[o.id] && <Pill tone="accent">📋 已规划</Pill>}
                  </div>
                  <div className="xpl-card-meta">
                    <div><strong>痛点</strong>{o.painPoint}</div>
                    <div><strong>模式</strong>{o.businessModel}</div>
                  </div>
                  <div className="xpl-card-actions">
                    <button
                      className={o.status === 'favorite' ? 'xpl-minibtn on' : 'xpl-minibtn'}
                      onClick={() => onPatch(o.id, { status: o.status === 'favorite' ? 'pool' : 'favorite' })}
                    >
                      ⭐ {o.status === 'favorite' ? '已收藏' : '收藏'}
                    </button>
                    <button
                      className={o.status === 'rejected' ? 'xpl-minibtn reject on' : 'xpl-minibtn reject'}
                      onClick={() => onPatch(o.id, { status: o.status === 'rejected' ? 'pool' : 'rejected' })}
                    >
                      ✕ {o.status === 'rejected' ? '已否决' : '否决'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="xpl-foot-row">
            <span className="xpl-muted">已生成 {opportunities.length} 个候选（演示 {mockCount} · 真实 AI {aiCount}）</span>
            <Button onClick={onNext}>进入系统筛选 →</Button>
          </div>
        </>
      )}

      <Modal open={bulkOpen} title="批量删除候选" onClose={() => setBulkOpen(false)}>
        <div className="xpl-bulk">
          <p className="xpl-small">
            按来源或状态批量清理候选。删除不可撤销，删除前会再次确认。
            「演示数据」是内置样本模拟生成的结果；「真实 AI」是你接入模型后生成的结果。
          </p>
          <div className="xpl-bulk-group">
            <h4>按来源</h4>
            <div className="xpl-bulk-row">
              <span>演示数据（假数据）</span>
              <span className="xpl-muted">{mockCount} 个</span>
              <Button small variant="danger" disabled={mockCount === 0} onClick={() => del(opportunities.filter((o) => o.source === 'mock').map((o) => o.id), '全部演示数据')}>
                删除演示数据
              </Button>
            </div>
            <div className="xpl-bulk-row">
              <span>真实 AI 数据</span>
              <span className="xpl-muted">{aiCount} 个</span>
              <Button small variant="danger" disabled={aiCount === 0} onClick={() => del(opportunities.filter((o) => o.source === 'ai').map((o) => o.id), '全部真实 AI 数据')}>
                删除真实数据
              </Button>
            </div>
          </div>
          <div className="xpl-bulk-group">
            <h4>按状态</h4>
            {([
              ['rejected', '已否决'],
              ['favorite', '已收藏'],
              ['shortlist', '短名单'],
              ['pool', '未处理（保留池）'],
            ] as [Opportunity['status'], string][]).map(([s, label]) => (
              <div key={s} className="xpl-bulk-row">
                <span>{label}</span>
                <span className="xpl-muted">{statusCount(s)} 个</span>
                <Button
                  small
                  variant="danger"
                  disabled={statusCount(s) === 0}
                  onClick={() => del(opportunities.filter((o) => o.status === s).map((o) => o.id), `所有「${label}」候选`)}
                >
                  删除{label}
                </Button>
              </div>
            ))}
          </div>
          <div className="xpl-bulk-group xpl-bulk-danger">
            <h4>危险区</h4>
            <div className="xpl-bulk-row">
              <span>清空全部候选</span>
              <span className="xpl-muted">{opportunities.length} 个</span>
              <Button small variant="danger" disabled={opportunities.length === 0} onClick={deleteAll}>
                全部清空
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
