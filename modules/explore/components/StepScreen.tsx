import { useMemo, useState } from 'react';
import type { AIConfig, DeepDive, Opportunity, PlansMap, ThemeProfile } from '../lib/types';
import { CRITERIA } from '../lib/criteria';
import { ai } from '../lib/ai';
import { effScore, grade, rankOpportunities } from '../lib/scoring';
import { Button, Head, Modal, Pill, ScoreBar, Spinner } from './ui';

export function StepScreen({
  config,
  profile,
  opportunities,
  weights,
  plans,
  onSetWeight,
  onPatch,
  onResetWeights,
  onNext,
}: {
  config: AIConfig;
  profile: ThemeProfile;
  opportunities: Opportunity[];
  weights: Record<string, number>;
  plans: PlansMap;
  onSetWeight: (id: string, n: number) => void;
  onPatch: (id: string, patch: Partial<Opportunity>) => void;
  onResetWeights: () => void;
  onNext: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'shortlist' | 'favorite' | 'rejected'>('all');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dive, setDive] = useState<{ opp: Opportunity; result?: DeepDive; loading: boolean } | null>(null);

  const criteria = useMemo(
    () => CRITERIA.map((c) => ({ ...c, weight: weights[c.id] ?? c.weight })),
    [weights]
  );

  const ranked = useMemo(() => rankOpportunities(opportunities, criteria), [opportunities, criteria]);

  const filtered = ranked.filter((r) => {
    const o = r.opp;
    if (filter === 'shortlist' && o.status !== 'shortlist') return false;
    if (filter === 'favorite' && o.status !== 'favorite') return false;
    if (filter === 'rejected' && o.status !== 'rejected') return false;
    if (q) {
      const hay = `${o.name} ${o.oneLiner} ${o.category} ${o.painPoint} ${o.businessModel}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function adjust(id: string, cid: string, delta: number) {
    const opp = opportunities.find((o) => o.id === id);
    if (!opp) return;
    const cur = effScore(opp, cid);
    onPatch(id, { overrides: { ...opp.overrides, [cid]: Math.max(1, Math.min(10, cur + delta)) } });
  }

  async function deepDive(opp: Opportunity) {
    setDive({ opp, loading: true });
    try {
      const result = await ai.deepDive(config, profile, opp);
      setDive({ opp, result, loading: false });
    } catch (e: any) {
      setDive({ opp, result: { thesis: '', strengths: [], risks: [], verdict: '谨慎', verdictReason: e?.message || '失败' }, loading: false });
    }
  }

  function addTopN(n: number) {
    ranked
      .filter((r) => r.opp.status !== 'rejected')
      .slice(0, n)
      .forEach((r) => onPatch(r.opp.id, { status: 'shortlist' }));
  }

  const shortlistCount = opportunities.filter((o) => o.status === 'shortlist').length;

  return (
    <div className="xpl-panel">
      <Head
        kicker="第三步 · 系统筛选"
        title="用孙正义式多维标准，把几百个候选筛成短名单"
        desc="孙正义把 40 项检查项目逐一打分；这里归纳为 10 个维度。权重由你调、分数可人工覆盖——筛选的「尺子」永远握在人手里。"
      />

      <div className="xpl-screen-layout">
        <aside className="xpl-weights">
          <div className="xpl-weights-head">
            <strong>筛选标准与权重</strong>
            <button className="xpl-link" onClick={onResetWeights}>重置</button>
          </div>
          <p className="xpl-small">拖动权重（0–5），更看重什么就调高什么。</p>
          {CRITERIA.map((c) => (
            <div key={c.id} className="xpl-weight-row" title={`${c.desc}｜${c.origin}`}>
              <div className="xpl-weight-row-head">
                <span className={c.kind === 'subjective' ? 'xpl-w-subj' : 'xpl-w-obj'}>{c.name}</span>
                <span className="xpl-weight-val">×{weights[c.id] ?? c.weight}</span>
              </div>
              <input
                className="xpl-range"
                type="range"
                min={0}
                max={5}
                step={1}
                value={weights[c.id] ?? c.weight}
                onChange={(e) => onSetWeight(c.id, Number(e.target.value))}
              />
            </div>
          ))}
        </aside>

        <div>
          <div className="xpl-toolbar">
            <div className="xpl-seg">
              <button className={filter === 'all' ? 'xpl-on' : ''} onClick={() => setFilter('all')}>全部</button>
              <button className={filter === 'shortlist' ? 'xpl-on' : ''} onClick={() => setFilter('shortlist')}>短名单 ({shortlistCount})</button>
              <button className={filter === 'favorite' ? 'xpl-on' : ''} onClick={() => setFilter('favorite')}>收藏</button>
              <button className={filter === 'rejected' ? 'xpl-on' : ''} onClick={() => setFilter('rejected')}>否决</button>
            </div>
            <input className="xpl-input xpl-search" placeholder="搜索名称 / 痛点 / 模式…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button small variant="outline" onClick={() => addTopN(5)}>前 5 名进短名单</Button>
          </div>

          {filtered.length === 0 && <div className="xpl-empty">没有匹配的候选。可调整筛选或返回上一步生成。</div>}

          <div className="xpl-rank-list">
            {filtered.map((r, idx) => {
              const o = r.opp;
              const g = grade(r.total);
              const isOpen = expanded.has(o.id);
              return (
                <div key={o.id} className={`xpl-rank-card status-${o.status}`}>
                  <div className="xpl-rank-head" onClick={() => toggle(o.id)}>
                    <span className="xpl-rank-no">#{idx + 1}</span>
                    <span className={`xpl-grade ${g.cls}`}>{g.label}</span>
                    <span className="xpl-rank-total">{r.total}</span>
                    <div className="xpl-rank-title">
                      <h3>{o.name}</h3>
                      <div className="xpl-card-tags">
                        <Pill>{o.category}</Pill>
                        <Pill tone={o.capitalNeed === '低' ? 'good' : o.capitalNeed === '中' ? 'warn' : 'bad'}>资金{o.capitalNeed}</Pill>
                        <Pill tone={o.competition === '低' ? 'good' : o.competition === '中' ? 'warn' : 'bad'}>竞争{o.competition}</Pill>
                        {o.status === 'shortlist' && <Pill tone="blue">已入短名单</Pill>}
                        {plans[o.id] && <Pill tone="accent">📋 已规划</Pill>}
                      </div>
                    </div>
                    <span className="xpl-chev">{isOpen ? '▴' : '▾'}</span>
                  </div>
                  <p className="xpl-card-liner">{o.oneLiner}</p>
                  {isOpen && (
                    <div className="xpl-rank-detail">
                      <div className="xpl-detail-scores">
                        {criteria.map((c) => {
                          const raw = effScore(o, c.id);
                          const isHuman = o.overrides[c.id] != null;
                          return (
                            <div key={c.id} className="xpl-score-edit">
                              <div style={{ flex: 1 }}>
                                <ScoreBar label={`${c.short}${isHuman ? ' ✎' : ''}`} value={raw} accent={isHuman} />
                              </div>
                              <div className="xpl-stepper-btns">
                                <button onClick={() => adjust(o.id, c.id, -1)}>−</button>
                                <button onClick={() => adjust(o.id, c.id, 1)}>＋</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="xpl-detail-text">
                        <div><strong>目标用户</strong>{o.targetUsers}</div>
                        <div><strong>痛点</strong>{o.painPoint}</div>
                        <div><strong>方案</strong>{o.solution}</div>
                        <div><strong>模式</strong>{o.businessModel}</div>
                        <div><strong>壁垒</strong>{o.moat}</div>
                        <div><strong>市场</strong>{o.marketNote}</div>
                        <div><strong>趋势</strong>{o.trend}</div>
                      </div>
                      <div className="xpl-detail-actions">
                        <Button small onClick={() => onPatch(o.id, { status: o.status === 'shortlist' ? 'pool' : 'shortlist' })}>
                          {o.status === 'shortlist' ? '移出短名单' : '☑ 加入短名单'}
                        </Button>
                        <Button small variant="ghost" onClick={() => onPatch(o.id, { status: o.status === 'favorite' ? 'pool' : 'favorite' })}>
                          {o.status === 'favorite' ? '取消收藏' : '⭐ 收藏'}
                        </Button>
                        <Button small variant="danger" onClick={() => onPatch(o.id, { status: o.status === 'rejected' ? 'pool' : 'rejected' })}>
                          {o.status === 'rejected' ? '取消否决' : '✕ 否决'}
                        </Button>
                        <Button small variant="accent" onClick={() => deepDive(o)}>🔍 深度研判</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="xpl-foot-row">
            <span className="xpl-muted">短名单 {shortlistCount} 个 —— 最终选哪个方向，由人拍板。</span>
            <Button onClick={onNext} disabled={shortlistCount === 0}>选定方向 → 逆向规划</Button>
          </div>
        </div>
      </div>

      <Modal open={!!dive} title={`深度研判 · ${dive?.opp.name || ''}`} onClose={() => setDive(null)}>
        {dive?.loading ? (
          <Spinner label="AI 正在深度研判…" />
        ) : (
          dive?.result && (
            <div className="xpl-dive">
              <Pill tone={dive.result.verdict === '不推荐' ? 'bad' : dive.result.verdict === '谨慎' ? 'warn' : dive.result.verdict === '强烈推荐' ? 'accent' : 'good'}>
                结论：{dive.result.verdict}
              </Pill>
              <p className="xpl-dive-thesis">{dive.result.thesis}</p>
              <div className="xpl-dive-cols">
                <div>
                  <h4>优势</h4>
                  <ul>{dive.result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div>
                  <h4>风险</h4>
                  <ul>{dive.result.risks.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              </div>
              <p className="xpl-dive-reason">{dive.result.verdictReason}</p>
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
