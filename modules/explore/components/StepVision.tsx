import { useState } from 'react';
import type { AIConfig, ThemeProfile } from '../lib/types';
import { ai, isMock } from '../lib/ai';
import { Button, Field, Head, Pill } from './ui';
import { LineIcon } from '@/components/icons';

const RISK: ThemeProfile['riskTolerance'][] = ['保守', '平衡', '激进'];

export function StepVision({
  config,
  profile,
  onChange,
  onNext,
}: {
  config: AIConfig;
  profile: ThemeProfile;
  onChange: (p: ThemeProfile) => void;
  onNext: () => void;
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState('');

  const set = (patch: Partial<ThemeProfile>) => onChange({ ...profile, ...patch });

  async function suggest() {
    setSuggesting(true);
    setError('');
    try {
      const s = await ai.generateThemeSuggestions(config, profile);
      setSuggestions(s);
    } catch (e: any) {
      setError(e?.message || '生成失败');
    } finally {
      setSuggesting(false);
    }
  }

  const canNext =
    profile.vision.trim().length > 0 ||
    profile.interests.trim().length > 0 ||
    profile.direction.trim().length > 0;

  return (
    <div className="xpl-panel">
      <Head
        kicker="第一步 · 决策门 ①"
        title="先定方向：你的愿景与探索主题"
        desc="先写清希望实现的结果，以及能投入的技能、时间、预算和渠道。越具体，候选之间的比较越有用。"
      />

      <div className="xpl-grid2">
        <Field label="人生 / 事业愿景（50 年计划式，一句话写终局）">
          <textarea
            className="xpl-textarea"
            rows={2}
            placeholder="例：用设计专长验证一个能带来稳定月收入的 AI 服务。"
            value={profile.vision}
            onChange={(e) => set({ vision: e.target.value })}
          />
        </Field>
        <Field label="本次想探索的主题 / 方向（人类拍板）" hint="留空可让 AI 给建议，但最终由你选定">
          <textarea
            className="xpl-textarea"
            rows={2}
            placeholder="例：AI + 品牌 + 设计 + 平台，仅服务独立品牌的视觉工作流。"
            value={profile.direction}
            onChange={(e) => set({ direction: e.target.value })}
          />
        </Field>
      </div>

      <div className="xpl-grid2">
        <Field label="兴趣与擅长领域">
          <textarea
            className="xpl-textarea"
            rows={2}
            placeholder="例：跨境电商、内容创作、编程、教育……"
            value={profile.interests}
            onChange={(e) => set({ interests: e.target.value })}
          />
        </Field>
        <Field label="个人强项（用于「强项契合」打分）">
          <textarea
            className="xpl-textarea"
            rows={2}
            placeholder="例：供应链资源、英语、算法、行业人脉……"
            value={profile.strengths}
            onChange={(e) => set({ strengths: e.target.value })}
          />
        </Field>
      </div>

      <div className="xpl-grid2">
        <Field label="已掌握资源（资金 / 人脉 / 技术 / 渠道）">
          <textarea
            className="xpl-textarea"
            rows={2}
            placeholder="例：可测试预算 2000 元、5 个可以访谈的老客户、现有设计工具。"
            value={profile.resources}
            onChange={(e) => set({ resources: e.target.value })}
          />
        </Field>
        <Field label="硬约束（地域 / 时间 / 资金上限 / 绝不做的）">
          <textarea
            className="xpl-textarea"
            rows={2}
            placeholder="例：base 杭州、每周最多 20 小时、不碰重资产……"
            value={profile.constraints}
            onChange={(e) => set({ constraints: e.target.value })}
          />
        </Field>
      </div>

      <div className="xpl-grid2">
        <Field label="风险偏好">
          <div className="xpl-seg">
            {RISK.map((r) => (
              <button
                key={r}
                className={profile.riskTolerance === r ? 'xpl-on' : ''}
                onClick={() => set({ riskTolerance: r })}
              >
                {r}
              </button>
            ))}
          </div>
        </Field>
        <Field label={`逆向规划时间跨度：${profile.horizonYears} 年`}>
          <input
            className="xpl-range"
            type="range"
            min={2}
            max={30}
            value={profile.horizonYears}
            onChange={(e) => set({ horizonYears: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div className="xpl-action-row">
        <Button variant="accent" onClick={suggest} disabled={suggesting}>
          {suggesting ? '生成中…' : <><LineIcon name="sparkles" /> 让 AI 给我方向建议</>}
        </Button>
        {!isMock(config) && <span className="xpl-muted">当前用真实模型：{config.model}</span>}
      </div>

      {error && <div className="xpl-error">{error}</div>}

      {suggestions.length > 0 && (
        <div className="xpl-suggestions">
          <div className="xpl-suggestions-title">AI 建议的方向（点击填入「探索主题」——最终仍由你决定）：</div>
          <div className="xpl-chip-row">
            {suggestions.map((s) => (
              <button key={s} className="xpl-chip" onClick={() => set({ direction: s })}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="xpl-foot-row">
        <Pill tone="accent">决策门：方向由人定，AI 只做参谋</Pill>
        <Button onClick={onNext} disabled={!canNext}>
          下一步：比较候选 →
        </Button>
      </div>
    </div>
  );
}
