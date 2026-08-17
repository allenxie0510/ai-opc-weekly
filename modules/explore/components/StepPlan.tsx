import { useState } from 'react';
import type { AIConfig, BackcastPlan, Opportunity, ThemeProfile } from '../lib/types';
import { ai, isMock } from '../lib/ai';
import { Button, Head, Pill, Spinner } from './ui';

export function StepPlan({
  config,
  profile,
  candidates,
}: {
  config: AIConfig;
  profile: ThemeProfile;
  candidates: Opportunity[];
}) {
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '');
  const [plan, setPlan] = useState<BackcastPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selected = candidates.find((c) => c.id === selectedId) ?? candidates[0];

  async function generate() {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const p = await ai.buildPlan(config, profile, selected);
      setPlan(p);
    } catch (e: any) {
      setError(e?.message || '生成失败');
    } finally {
      setLoading(false);
    }
  }

  function copyMarkdown() {
    if (!plan || !selected) return;
    const lines = [
      `# ${selected.name} · 逆向规划`,
      '',
      `> 愿景：${plan.finalVision}`,
      `> 成功度量：${plan.successMetric}`,
      '',
      '## 倒推里程碑（从终点倒推回现在）',
      '',
      ...plan.milestones.map((m) => [
        `### ${m.timeLabel} —— ${m.goal}`,
        '',
        `- 关键结果：${m.keyResults.map((k) => `「${k}」`).join('、')}`,
        `- 所需资源：${m.resources}`,
        `- 待验证假设：${m.assumptions}`,
        `- 风险：${m.risks}`,
        '',
      ]).flat(),
      '## 本周第一步',
      '',
      plan.firstStep,
    ];
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    alert('已复制 Markdown 到剪贴板');
  }

  return (
    <div className="xpl-panel">
      <Head
        kicker="第四步 · 逆向规划"
        title="从 10 年后的终局，倒推回「本周该做什么」"
        desc="孙正义的「トップダウン」式思考：先确定终点（成为第一），再倒推每个阶段的里程碑。方向已定，剩下的是把愿景翻译成行动。"
      />

      <div className="xpl-plan-select">
        <label>选择要规划的方向（短名单 / 收藏）</label>
        <select className="xpl-select" value={selected?.id} onChange={(e) => { setSelectedId(e.target.value); setPlan(null); }}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}（{c.category}）
            </option>
          ))}
        </select>
        <Button onClick={generate} disabled={!selected || loading}>
          {loading ? '逆向规划中…' : '🧭 生成逆向规划'}
        </Button>
        {plan && <Button variant="outline" onClick={copyMarkdown}>复制 Markdown</Button>}
        {isMock(config) && <span className="xpl-muted">演示模式</span>}
      </div>

      {error && <div className="xpl-error">{error}</div>}
      {loading && <Spinner label="AI 正在从终局倒推里程碑…" />}

      {plan && selected && (
        <div className="xpl-plan-result">
          <div className="xpl-vision">
            <Pill tone="blue">终局愿景（{profile.horizonYears} 年后）</Pill>
            <h3>{plan.finalVision}</h3>
            <p>成功度量：{plan.successMetric}</p>
          </div>

          <div className="xpl-timeline">
            {plan.milestones.map((m, i) => (
              <div key={i} className="xpl-tl-item">
                <div className="xpl-tl-marker">
                  <span>{i === 0 ? '🏁' : '▲'}</span>
                </div>
                <div className="xpl-tl-card">
                  <div className="xpl-tl-head">
                    <span className="xpl-tl-time">{m.timeLabel}</span>
                    <span className="xpl-tl-arrow">{i === 0 ? '从这里出发' : '倒推 ↑'}</span>
                  </div>
                  <h4>{m.goal}</h4>
                  <div className="xpl-tl-kr">
                    {m.keyResults.map((k, j) => (
                      <Pill key={j}>{k}</Pill>
                    ))}
                  </div>
                  <div className="xpl-tl-meta">
                    <div><strong>所需资源</strong>{m.resources}</div>
                    <div><strong>待验证假设</strong>{m.assumptions}</div>
                    <div><strong>风险</strong>{m.risks}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="xpl-first-step">
            <Pill tone="good">本周第一步（现在就做）</Pill>
            <p>{plan.firstStep}</p>
          </div>

          <div className="xpl-foot-row">
            <span className="xpl-muted">人的参与：里程碑可与你自己的节奏冲突，请据实调整，再让 AI 重跑。</span>
            <Button variant="ghost" onClick={generate} disabled={loading}>换一个版本重跑</Button>
          </div>
        </div>
      )}
    </div>
  );
}
