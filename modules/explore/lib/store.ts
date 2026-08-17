import type { AIConfig, Opportunity, ThemeProfile } from './types';
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
