'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
import { LineIcon } from '@/components/icons';

const STEPS = [
  { id: 0, label: '定方向', sub: '愿景与主题' },
  { id: 1, label: '比较候选', sub: '方向内扩展' },
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

type PublicExample = { title: string; slug: string; customer: string; thesis: string; risk: string; firstStep: string };

export function ExploreApp({ example = null, initialDirection = '' }: { example?: PublicExample | null; initialDirection?: string }) {
  const [mounted, setMounted] = useState(false);
  const [authReady, setAuthReady] = useState(false);
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
  const [saving, setSaving] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');
  const [sessionError, setSessionError] = useState('');

  // 客户端挂载：读本地草稿
  useEffect(() => {
    const s = loadState();
    setConfig(s.config);
    setProfile(s.profile);
    setWeights(s.weights);
    setOpportunities(s.opportunities);
    setPlans(s.plans);
    setMounted(true);
  }, []);

  // 本地兜底存储
  useEffect(() => {
    if (mounted && user) saveState({ config, profile, weights, opportunities, plans });
  }, [mounted, user, config, profile, weights, opportunities, plans]);

  // 登录态监听
  useEffect(() => {
    let active = true;
    getSession()
      .then((s) => {
        if (active) setUser(s?.user ?? null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    const unsubscribe = onAuthChange((s) => {
      setUser(s?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
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
    try {
      const t = await getToken();
      if (!t) return;
      const res = await fetch('/api/explore/sessions', { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) throw new Error('探索列表加载失败，请重试。');
      const d = await res.json();
      setSessions((d.sessions || []).map(normalizeSession));
      setSessionError('');
    } catch {
      setSessionError('探索列表加载失败。当前草稿仍在，可重新加载列表。');
    }
  }

  async function saveSession(title: string) {
    if (saving) return;
    setSaving(true);
    setSessionNotice('');
    setSessionError('');
    try {
    const t = await getToken();
    if (!t) {
      setLoginOpen(true);
      return;
    }
    const payload = { title: title.trim() || sessions.find((s) => s.id === currentSessionId)?.title || profile.direction.trim() || '未命名探索', profile, weights, opportunities, plans };
    const res = await fetch(currentSessionId ? `/api/explore/sessions/${currentSessionId}` : '/api/explore/sessions', {
      method: currentSessionId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const d = await res.json();
      if (d.session?.id) setCurrentSessionId(d.session.id);
      await loadSessions();
      setSessionNotice('已保存到账号，可在其他设备登录后加载。');
    } else {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || '保存失败，请重试。');
    }
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : '保存失败，当前草稿仍在，请重试。');
    } finally { setSaving(false); }
  }

  function loadSession(s: ExploreSession) {
    setCurrentSessionId(s.id);
    setProfile(s.profile || { ...EMPTY_PROFILE });
    setWeights(s.weights || defaultWeights());
    setOpportunities(s.opportunities || []);
    setPlans(s.plans || {});
    setStep(0);
    setView('engine');
    setSessionNotice(`已加载「${s.title}」`);
    setSessionError('');
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
    setSessionNotice('');
    setSessionError('');
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

  if (!mounted || !authReady) {
    return (
      <div className="xpl-spinner-wrap">
        <div className="xpl-spinner" />
        <span>正在确认登录状态…</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="xpl-wrap">
        <section className="explore-preview" aria-labelledby="explore-value-title">
          <h2 id="explore-value-title">把一个方向，研究到可以做取舍。</h2>
          <p>输入你的技能、每周可用时间、预算和客户资源，AI 会在你选定的方向内部扩展候选，再按你的标准比较。生成结果是待验证假设，需要你继续核对来源与客户需求。</p>
          <div className="decision-grid"><article><h3>你提供</h3><p>擅长什么、能接触谁、愿意投入多少，以及明确不做的事。</p></article><article><h3>你得到</h3><p>候选对比、适合与不适合的理由、风险和分阶段行动计划。</p></article><article><h3>下一步</h3><p>选少量方向，记录访谈和试用行为，保存结果后继续调整。</p></article></div>
          {example && <details className="public-example"><summary>查看已发布机会示例：{example.title}</summary><p className="product-note">这是机会库的真实已发布内容示例，不是个性化报告，也不代表假设已经验证。</p><dl><dt>机会假设</dt><dd>{example.thesis}</dd><dt>目标客户</dt><dd>{example.customer || '尚未明确'}</dd><dt>反对理由</dt><dd>{example.risk || '尚需补充'}</dd><dt>第一个动作</dt><dd>{example.firstStep || '先明确需要检验的核心假设'}</dd></dl><Link href={`/opportunities/${example.slug}`}>打开完整分析与来源</Link></details>}
        </section>
        <section className="xpl-auth-gate" aria-labelledby="xpl-auth-gate-title">
          <div className="xpl-auth-gate-icon" aria-hidden="true"><LineIcon name="external-link" /></div>
          <div className="xpl-auth-gate-copy">
            <span className="xpl-kicker">登录后使用</span>
            <h2 id="xpl-auth-gate-title">方向探测器需要邮箱登录</h2>
            <p>
              登录后可开始 AI 研究，并手动保存探索以便跨设备继续。请回到当前浏览器输入邮件验证码。
            </p>
            <div className="xpl-auth-gate-points" aria-label="登录后可使用的功能">
              <span>定方向</span>
              <span>比较候选</span>
              <span>系统筛选</span>
              <span>逆向规划</span>
            </div>
            <Button onClick={() => setLoginOpen(true)}>使用邮箱登录</Button>
            <p className="product-note">当前无需付款即可使用；服务繁忙时请稍后重试。{initialDirection && `登录后可将「${initialDirection}」设为研究方向。`}</p>
          </div>
        </section>
        {loginOpen && <LoginModal open user={null} onClose={() => setLoginOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="xpl-wrap">
      {initialDirection && <div className="reading-cta"><div><strong>从机会库继续：{initialDirection}</strong><p>将其设为研究方向，再填写你的个人条件。应用后会清空当前候选与规划。</p></div><Button small onClick={() => {
        if ((opportunities.length || profile.direction || Object.keys(plans).length) && !confirm('应用新方向会清空当前候选与规划，请先保存需要保留的探索。继续？')) return;
        setProfile({ ...profile, direction: initialDirection }); setOpportunities([]); setPlans({}); setCurrentSessionId(null); setStep(0); setView('engine');
      }}>应用这个方向</Button></div>}
      {sessionNotice && <p role="status" className="product-note">{sessionNotice}</p>}
      <div className="xpl-tabs">
        <button className={`xpl-tab ${view === 'engine' ? 'on' : ''}`} onClick={() => setView('engine')}>
          探索引擎
        </button>
        <button className={`xpl-tab ${view === 'method' ? 'on' : ''}`} onClick={() => setView('method')}>
          方法论
        </button>
        <button className="xpl-tab" onClick={() => (user ? setSessionsOpen(true) : setLoginOpen(true))}>
          <LineIcon name="folder" /> 我的探索
        </button>
        <button className="xpl-tab" onClick={() => setSessionsOpen(true)}><LineIcon name="save" /> 保存进度</button>
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
        saving={saving}
        notice={sessionNotice}
        error={sessionError}
        onRetry={() => void loadSessions()}
        open={sessionsOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onClose={() => { if (!saving) setSessionsOpen(false); }}
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
