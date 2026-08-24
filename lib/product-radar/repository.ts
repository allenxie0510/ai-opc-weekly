import { supabase } from '@/lib/supabase';
import { calculateProfit } from './profit';
import { getFixtureOpportunities, getFixtureRunSummary } from './fixtures';
import { getProductRadarDataMode, isStale } from './config';
import type { ProductOpportunity, ProductRadarFeed, ProductRadarFilters, ProductRadarRunSummary, RiskLevel } from './domain';

export interface ProductRadarRepository {
  list(filters?: ProductRadarFilters): Promise<ProductRadarFeed>;
  getBySlug(slug: string): Promise<ProductOpportunity | null>;
  getRunSummary(): Promise<ProductRadarRunSummary>;
}

const RISK_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'blocked'];

function filterItems(items: ProductOpportunity[], filters: ProductRadarFilters = {}): ProductOpportunity[] {
  const filtered = items.filter((item) => {
    if (filters.category && item.category !== filters.category) return false;
    if (filters.stage && item.stage !== filters.stage) return false;
    if (filters.decision && item.decision !== filters.decision) return false;
    if (filters.onePieceDropship && !item.supplyOffers.some((offer) => offer.onePieceDropship)) return false;
    if (typeof filters.minMargin === 'number' && calculateProfit(item.profitDefaults).contributionMargin < filters.minMargin) return false;
    if (filters.maxRisk && RISK_ORDER.indexOf(item.riskLevel) > RISK_ORDER.indexOf(filters.maxRisk)) return false;
    return true;
  });
  return filtered.sort((a, b) => b.score.finalScore - a.score.finalScore);
}

export class FixtureProductRadarRepository implements ProductRadarRepository {
  constructor(private readonly now = new Date()) {}

  async list(filters: ProductRadarFilters = {}): Promise<ProductRadarFeed> {
    const all = getFixtureOpportunities(this.now);
    const filtered = filterItems(all, filters);
    const offset = Math.max(0, filters.offset ?? 0);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const run = getFixtureRunSummary(this.now);
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      categories: [...new Set(all.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      run,
      stale: all.every((item) => isStale(item.dataAsOf, this.now)),
      mode: 'fixture',
    };
  }

  async getBySlug(slug: string): Promise<ProductOpportunity | null> {
    return getFixtureOpportunities(this.now).find((item) => item.slug === slug) ?? null;
  }

  async getRunSummary(): Promise<ProductRadarRunSummary> {
    return getFixtureRunSummary(this.now);
  }
}

class SupabaseProductRadarRepository implements ProductRadarRepository {
  private readonly fallback = new FixtureProductRadarRepository();

  async list(filters: ProductRadarFilters = {}): Promise<ProductRadarFeed> {
    if (!supabase) return this.fallback.list(filters);
    const { data, error } = await supabase
      .from('product_opportunities')
      .select('payload')
      .eq('status', 'published')
      .order('score', { ascending: false })
      .limit(100);
    if (error || !data?.length) return this.fallback.list(filters);
    const items = data.map((row) => row.payload as ProductOpportunity).filter(Boolean);
    const filtered = filterItems(items, filters);
    const offset = Math.max(0, filters.offset ?? 0);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      categories: [...new Set(items.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      run: await this.getRunSummary(),
      stale: items.every((item) => isStale(item.dataAsOf)),
      mode: 'live',
    };
  }

  async getBySlug(slug: string): Promise<ProductOpportunity | null> {
    if (!supabase) return this.fallback.getBySlug(slug);
    const { data, error } = await supabase
      .from('product_opportunities')
      .select('payload')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();
    if (error || !data?.payload) return this.fallback.getBySlug(slug);
    return data.payload as ProductOpportunity;
  }

  async getRunSummary(): Promise<ProductRadarRunSummary> {
    if (!supabase) return this.fallback.getRunSummary();
    const { data, error } = await supabase
      .from('product_radar_runs')
      .select('summary')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.summary) return this.fallback.getRunSummary();
    return data.summary as ProductRadarRunSummary;
  }
}

let repository: ProductRadarRepository | undefined;

export function getProductRadarRepository(): ProductRadarRepository {
  if (!repository) {
    repository = getProductRadarDataMode() === 'live'
      ? new SupabaseProductRadarRepository()
      : new FixtureProductRadarRepository();
  }
  return repository;
}
