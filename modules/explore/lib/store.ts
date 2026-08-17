import type { AIConfig, BackcastPlan, Opportunity, ThemeProfile } from './types';
import { EMPTY_PROFILE } from './types';
import { DEFAULT_CONFIG, isMockName } from './ai';
import { CRITERIA } from './criteria';

export interface PersistState {
  config: AIConfig;
  profile: ThemeProfile;
  weights: Record<string, number>;
  opportunities: Opportunity[];
}

const KEY = 'ai_opc_explore_v1';

export function loadState(): PersistState {
  const weights: Record<string, number> = {};
  for (const c of CRITERIA) weights[c.id] = c.weight;
  const base: PersistState = {
    config: { ...DEFAULT_CONFIG },
    profile: { ...EMPTY_PROFILE },
    weights,
    opportunities: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      config: { ...base.config, ...(parsed.config || {}) },
      profile: { ...base.profile, ...(parsed.profile || {}) },
      weights: { ...weights, ...(parsed.weights || {}) },
      opportunities: Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map((o: any) => ({
            ...o,
            overrides: o.overrides || {},
            scores: o.scores || {},
            source: o.source ?? (isMockName(String(o.name || '')) ? 'mock' : 'ai'),
            createdAt: o.createdAt ?? 0,
          }))
        : [],
    };
  } catch {
    return base;
  }
}

export function saveState(state: PersistState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/* ── 匿名用户标识 + 云端存储（无账号系统）────────────────────── */

const UID_KEY = 'ai_opc_uid';

export function getUid(): string {
  try {
    let uid = localStorage.getItem(UID_KEY);
    if (!uid) {
      uid =
        (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
        'uid-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(UID_KEY, uid);
    }
    return uid;
  } catch {
    return 'anon-' + Date.now().toString(36);
  }
}

/** 云端持久化的用户状态（与 localStorage 的 PersistState 基本一致，另含最终规划） */
export interface CloudState {
  profile: ThemeProfile;
  weights: Record<string, number>;
  opportunities: Opportunity[];
  plan?: BackcastPlan | null;
}

export async function fetchCloudState(uid: string): Promise<CloudState | null> {
  try {
    const res = await fetch(`/api/explore/storage?user_id=${encodeURIComponent(uid)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data && data.state) || null;
  } catch {
    return null;
  }
}

export async function saveCloudState(uid: string, state: CloudState): Promise<void> {
  try {
    await fetch('/api/explore/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, state }),
    });
  } catch {
    /* 网络失败静默忽略，本地 localStorage 仍是兜底 */
  }
}
