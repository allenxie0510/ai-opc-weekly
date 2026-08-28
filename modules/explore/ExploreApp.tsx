'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AIConfig, BackcastPlan, ExploreSession, Opportunity, PlansMap, ThemeProfile } from './lib/types';
import { EMPTY_PROFILE } from './lib/types';
import { DEFAULT_CONFIG } from './lib/ai';
import { CRITERIA } from './lib/criteria';
import { clearState, loadState, saveState } from './lib/store';
import { getSession, getToken, onAuthChange } from './lib/auth';
import { Methodology } from './components/Methodology';
import { StepVision } from './components/StepVision';
import { StepGenerate } from './components/StepGenerate';
import { StepScreen } from './components/StepScreen';
import { StepPlan } from './components/StepPlan';
import { LoginModal } from './components/LoginModal';
import { SessionsModal } from './components/SessionsModal';
import { Button, Field, Modal, Stepper } from './components/ui';

const STEPS = [
  { id: 0, label: '定方向', sub: '愿景与主题' },
  { id: 1, label: '海量生成', sub: '数百候选' },
  { id: 2, label: '系统筛选', sub: '多维打分' },
  { id: 3, label: '逆向规划', sub: '倒推里程碑' },
];

function defaultWeights(): Record<string, number> {
  const w: Record<string, number> = {};
  CRITERIA.forEach((c) => (w[c.id] = c.weight));
  return w;
}

function normalizeSession(raw: any): ExploreSession {
  return {
    id: String(raw.id || ''),
    title: String(raw.title || '未命名探索'),
    profile: raw.profile && typeof raw.profile === 'object' ? raw.profile : { ...EMPTY_PROFILE },
    weights: raw.weights && typeof raw.weights === 'object' ? raw.weights : defaultWeights(),
    opportunities: Array.isArray(raw.opportunities) ? raw.opportunities : [],
    plans: raw.plans && typeof raw.plans === 'object' ? raw.plans : {},
    created_at: String(raw.created_at || ''),
    updated_at: String(raw.updated_at || ''),
  };
}

export function ExploreApp() {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<'method' | 'engine'>('engine');
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [profile, setProfile] = useState<ThemeProfile>(EMPTY_PROFILE);
  const [weights, setWeights] = useState<Record<string, number>>(defaultWeights);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [plans, setPlans] = useState<PlansMap>({});
  const [configOpen, setConfigOpen] = useState(false);

  // 登录与会话
  const [user, setUser] = useState<User | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<ExploreSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // 客户端挂载：读本地草稿
  useEffect(() => {
    const s = loadState();
    setConfig(s.config);
    setProfile(s.profile);
    setWeights(s.weights);
    setOpportunities(s.opportunities);
    setMounted(true);
  }, []);

  // 本地兜底存储
  useEffect(() => {
    if (mounted) saveState({ config, profile, weights, opportunities });
  }, [mounted, config, profile, weights, opportunities]);

  // 登录态监听
  useEffect(() => {
    getSession().then((s) => setUser(s?.user ?? null));
    return onAuthChange((s) => setUser(s?.user ?? null));
  }, []);

  // 登录成功后自动关闭登录弹窗
  useEffect(() => {
    if (user) setLoginOpen(false);
  }, [user]);

  // 全局 header 的「登录」入口跳转进来时（/explore?login=1）自动打开登录弹窗，
  // 用 window.location 读取避免 useSearchParams 的 Suspense 要求；打开后清掉参数防刷新复弹
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('login') === '1') {
      setLoginOpen(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // 登录后拉取会话列表
  useEffect(() => {
    if (user) {
      loadSessions();
    } else {
      setSessions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadSessions() {
    const t = await getToken();
    if (!t) return;
    const res = await fetch('/api/explore/sessions', { headers: { Authorization: `Bearer ${t}` } });
    if (!res.ok) return;
    const d = await res.json();
    setSessions((d.sessions || []).map(normalizeSession));
  }

  async function saveSession(title: string) {
    const t = await getToken();
    if (!t) {
      setLoginOpen(true);
      return;
    }
    const payload = { title: title.trim() || '未命名探索', profile, weights, opportunities, plans };
    const res = await fetch(currentSessionId ? `/api/explore/sessions/${currentSessionId}` : '/api/explore/sessions', {
      method: currentSessionId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.session?.id) setCurrentSessionId(d.session.id);
      await loadSessions();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || '保存失败');
    }
  }

  function loadSession(s: ExploreSession) {
    setCurrentSessionId(s.id);
    setProfile(s.profile || { ...EMPTY_PROFILE });
    setWeights(s.weights || defaultWeights());
    setOpportunities(s.opportunities || []);
    setPlans(s.plans || {});
    setStep(0);
    setView('engine');
  }

  async function deleteSession(id: string) {
    if (!confirm('删除这个探索？此操作不可恢复。')) return;
    const t = await getToken();
    if (!t) return;
    const res = await fetch(`/api/explore/sessions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
    if (res.ok) {
      if (currentSessionId === id) setCurrentSessionId(null);
      await loadSessions();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || '删除失败');
    }
  }

  function newExploration() {
    const hasContent = opportunities.length > 0 || profile.vision || profile.direction || profile.interests;
    if (hasContent && !confirm('新建空白探索会清空当前进度，建议先「保存当前探索」。确定继续？')) return;
    setCurrentSessionId(null);
    setProfile({ ...EMPTY_PROFILE });
    setWeights(defaultWeights());
    setOpportunities([]);
    setPlans({});
    setStep(0);
    setView('engine');
  }

  function patchProfile(p: ThemeProfile) {
    setProfile(p);
  }
  function appendOpps(list: Opportunity[]) {
    setOpportunities((prev) => {
      const seen = new Set(prev.map((o) => o.id));
      return [...prev, ...list.filter((o) => !seen.has(o.id))];
    });
  }
  function replaceOpps(list: Opportunity[]) {
    setOpportunities(list);
    setPlans({});
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
    setWeights(defaultWeights());
  }
  function onPlanChange(ideaId: string, plan: BackcastPlan) {
    setPlans((prev) => ({ ...prev, [ideaId]: plan }));
  }
  function resetAll() {
    if (!confirm('清空「方向探测器」的所有进度并回到初始状态？（不影响已保存的探索）')) return;
    clearState();
    setConfig(DEFAULT_CONFIG);
    setProfile({ ...EMPTY_PROFILE });
    setWeights(defaultWeights());
    setOpportunities([]);
    setPlans({});
    setCurrentSessionId(null);
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
        <button className="xpl-tab" onClick={() => (user ? setSessionsOpen(true) : setLoginOpen(true))}>
          📁 我的探索
        </button>
        <button className="xpl-tab xpl-tab-ghost" onClick={resetAll}>
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
              plans={plans}
              onReplace={replaceOpps}
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
              plans={plans}
              onSetWeight={setWeight}
              onPatch={patchOpp}
              onResetWeights={resetWeights}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <StepPlan config={config} profile={profile} candidates={candidates} plans={plans} onPlanChange={onPlanChange} />
          )}
        </>
      )}

      {loginOpen && <LoginModal open user={user} onClose={() => setLoginOpen(false)} />}
      <SessionsModal
        open={sessionsOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onClose={() => setSessionsOpen(false)}
        onSave={saveSession}
        onLoad={loadSession}
        onDelete={deleteSession}
        onNew={newExploration}
        onOpenConfig={() => { setSessionsOpen(false); setConfigOpen(true); }}
      />
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
          <button className={draft.provider === 'server' ? 'xpl-on' : ''} onClick={() => set({ provider: 'server' })}>
            服务端 AI（推荐 · 免 Key）
          </button>
          <button className={draft.provider === 'mock' ? 'xpl-on' : ''} onClick={() => set({ provider: 'mock' })}>
            演示模式
          </button>
          <button className={draft.provider === 'openai' ? 'xpl-on' : ''} onClick={() => set({ provider: 'openai' })}>
            自带 Key
          </button>
        </div>
      </Field>
      {draft.provider === 'server' && (
        <p className="xpl-small">
          使用站长在服务端配置的 DeepSeek 密钥，访客无需自己填 Key。
          若服务器未配置，将提示错误，此时可切换为「演示模式」。
        </p>
      )}
      {draft.provider === 'openai' && (
        <>
          <Field label="API 端点（OpenAI 兼容）" hint="默认 DeepSeek，也可填任意 OpenAI 兼容服务">
            <input className="xpl-input" value={draft.endpoint} onChange={(e) => set({ endpoint: e.target.value })} placeholder="https://api.deepseek.com/v1" />
          </Field>
          <Field label="模型">
            <input className="xpl-input" value={draft.model} onChange={(e) => set({ model: e.target.value })} placeholder="deepseek-v4-flash" />
          </Field>
          <Field label="API Key" hint="仅保存在你的浏览器 localStorage，不会上传到服务器">
            <input className="xpl-input" type="password" value={draft.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder="sk-..." />
          </Field>
        </>
      )}
      <p className="xpl-small">
        演示模式内置 40+ 个结构化样本与模拟打分，可完整体验全流程；服务端 AI / 自带 Key 可海量生成 + 深度研判 + 逆向规划。
      </p>
      <div className="xpl-foot-row">
        <Button variant="ghost" onClick={() => set({ ...DEFAULT_CONFIG })}>恢复默认</Button>
        <Button onClick={() => { onChange(draft); onClose(); }}>保存</Button>
      </div>
    </Modal>
  );
}
