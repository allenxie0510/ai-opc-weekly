'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AIConfig, Opportunity, ThemeProfile } from './lib/types';
import { EMPTY_PROFILE } from './lib/types';
import { DEFAULT_CONFIG } from './lib/ai';
import { CRITERIA } from './lib/criteria';
import { clearState, loadState, saveState } from './lib/store';
import { Methodology } from './components/Methodology';
import { StepVision } from './components/StepVision';
import { StepGenerate } from './components/StepGenerate';
import { StepScreen } from './components/StepScreen';
import { StepPlan } from './components/StepPlan';
import { Button, Field, Modal, Stepper } from './components/ui';

const STEPS = [
  { id: 0, label: '定方向', sub: '愿景与主题' },
  { id: 1, label: '海量生成', sub: '数百候选' },
  { id: 2, label: '系统筛选', sub: '多维打分' },
  { id: 3, label: '逆向规划', sub: '倒推里程碑' },
];

export function ExploreApp() {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'method' | 'engine'>('engine');
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [profile, setProfile] = useState<ThemeProfile>(EMPTY_PROFILE);
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const w: Record<string, number> = {};
    CRITERIA.forEach((c) => (w[c.id] = c.weight));
    return w;
  });
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [configOpen, setConfigOpen] = useState(false);

  // 客户端挂载后读取持久化状态，避免 SSR/hydration 不一致
  useEffect(() => {
    const s = loadState();
    setConfig(s.config);
    setProfile(s.profile);
    setWeights(s.weights);
    setOpportunities(s.opportunities);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveState({ config, profile, weights, opportunities });
  }, [mounted, config, profile, weights, opportunities]);

  function patchProfile(p: ThemeProfile) {
    setProfile(p);
  }
  function appendOpps(list: Opportunity[]) {
    setOpportunities((prev) => {
      const seen = new Set(prev.map((o) => o.id));
      return [...prev, ...list.filter((o) => !seen.has(o.id))];
    });
  }
  function patchOpp(id: string, patch: Partial<Opportunity>) {
    setOpportunities((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function deleteOpps(ids: string[]) {
    const idSet = new Set(ids);
    setOpportunities((prev) => prev.filter((o) => !idSet.has(o.id)));
  }
  function setWeight(id: string, n: number) {
    setWeights((prev) => ({ ...prev, [id]: n }));
  }
  function resetWeights() {
    const w: Record<string, number> = {};
    CRITERIA.forEach((c) => (w[c.id] = c.weight));
    setWeights(w);
  }
  function resetAll() {
    if (!confirm('清空「方向探测器」的所有进度并回到初始状态？')) return;
    clearState();
    setConfig(DEFAULT_CONFIG);
    setProfile(EMPTY_PROFILE);
    resetWeights();
    setOpportunities([]);
  }

  const candidates = useMemo(() => {
    const pick = opportunities.filter((o) => o.status === 'shortlist' || o.status === 'favorite');
    const fallback = opportunities.filter((o) => o.status !== 'rejected').slice(0, 10);
    return pick.length ? pick : fallback;
  }, [opportunities]);

  if (!mounted) {
    return (
      <div className="xpl-spinner-wrap">
        <div className="xpl-spinner" />
      </div>
    );
  }

  return (
    <div className="xpl-wrap">
      <div className="xpl-tabs">
        <button className={`xpl-tab ${view === 'engine' ? 'on' : ''}`} onClick={() => setView('engine')}>
          探索引擎
        </button>
        <button className={`xpl-tab ${view === 'method' ? 'on' : ''}`} onClick={() => setView('method')}>
          方法论
        </button>
        <button className="xpl-tab" onClick={() => setConfigOpen(true)}>
          ⚙️ AI 设置
        </button>
        <button className="xpl-tab" onClick={resetAll}>
          清空
        </button>
      </div>

      {view === 'method' ? (
        <Methodology onStart={() => { setView('engine'); setStep(0); }} />
      ) : (
        <>
          <Stepper steps={STEPS} current={step} onGo={setStep} />
          {step === 0 && (
            <StepVision config={config} profile={profile} onChange={patchProfile} onNext={() => setStep(1)} />
          )}
          {step === 1 && (
            <StepGenerate
              config={config}
              profile={profile}
              opportunities={opportunities}
              onAppend={appendOpps}
              onPatch={patchOpp}
              onDelete={deleteOpps}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepScreen
              config={config}
              profile={profile}
              opportunities={opportunities}
              weights={weights}
              onSetWeight={setWeight}
              onPatch={patchOpp}
              onResetWeights={resetWeights}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && <StepPlan config={config} profile={profile} candidates={candidates} />}
        </>
      )}

      <ConfigModal open={configOpen} config={config} onChange={setConfig} onClose={() => setConfigOpen(false)} />
    </div>
  );
}

function ConfigModal({
  open,
  config,
  onChange,
  onClose,
}: {
  open: boolean;
  config: AIConfig;
  onChange: (c: AIConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AIConfig>(config);
  useEffect(() => setDraft(config), [config, open]);

  const set = (patch: Partial<AIConfig>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Modal open={open} title="AI 设置" onClose={onClose}>
      <Field label="运行模式">
        <div className="xpl-seg">
          <button className={draft.provider === 'mock' ? 'xpl-on' : ''} onClick={() => set({ provider: 'mock' })}>
            演示模式（无需 Key）
          </button>
          <button className={draft.provider === 'openai' ? 'xpl-on' : ''} onClick={() => set({ provider: 'openai' })}>
            真实模型
          </button>
        </div>
      </Field>
      {draft.provider === 'openai' && (
        <>
          <Field label="API 端点（OpenAI 兼容）" hint="默认 DeepSeek，也可填任意 OpenAI 兼容服务">
            <input className="xpl-input" value={draft.endpoint} onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://api.deepseek.com/v1" />
          </Field>
          <Field label="模型">
            <input className="xpl-input" value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder="deepseek-v4-flash" />
          </Field>
          <Field label="API Key" hint="仅保存在你的浏览器 localStorage，不会上传到任何服务器">
            <input className="xpl-input" type="password" value={draft.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="sk-..." />
          </Field>
        </>
      )}
      <p className="xpl-small">
        演示模式内置 40+ 个结构化样本与模拟打分，可完整体验全流程；接入真实模型后可海量生成 + 深度研判 + 逆向规划。
      </p>
      <div className="xpl-foot-row">
        <Button variant="ghost" onClick={() => set({ ...DEFAULT_CONFIG })}>恢复默认</Button>
        <Button onClick={() => { onChange(draft); onClose(); }}>保存</Button>
      </div>
    </Modal>
  );
}
