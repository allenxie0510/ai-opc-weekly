import { NextRequest, NextResponse } from 'next/server';
import { isProductRadarEnabled, PRODUCT_RADAR_CACHE_SECONDS } from '@/lib/product-radar/config';
import { requestCanAccessProductRadar } from '@/lib/product-radar/access';
import { getProductRadarRepository } from '@/lib/product-radar/repository';
import type { DecisionLabel, OpportunityStage, RiskLevel } from '@/lib/product-radar/domain';

const stages = new Set<OpportunityStage>(['emerging', 'accelerating', 'breakout', 'crowded', 'declining']);
const decisions = new Set<DecisionLabel>(['值得测试', '小规模测试', '保持关注', '谨慎进入', '暂不建议']);
const risks = new Set<Exclude<RiskLevel, 'blocked'>>(['low', 'medium', 'high']);

function numberParam(value: string | null, min: number, max: number) {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : undefined;
}

export async function GET(request: NextRequest) {
  if (!requestCanAccessProductRadar(request)) return NextResponse.json({ error: 'Product radar is disabled' }, { status: 404 });
  const query = request.nextUrl.searchParams;
  const stage = query.get('stage') as OpportunityStage | null;
  const decision = query.get('decision') as DecisionLabel | null;
  const maxRisk = query.get('maxRisk') as Exclude<RiskLevel, 'blocked'> | null;
  const feed = await getProductRadarRepository().list({
    category: query.get('category') || undefined,
    stage: stage && stages.has(stage) ? stage : undefined,
    decision: decision && decisions.has(decision) ? decision : undefined,
    onePieceDropship: query.get('dropship') === 'true' || undefined,
    minMargin: numberParam(query.get('minMargin'), 0, 100),
    maxRisk: maxRisk && risks.has(maxRisk) ? maxRisk : undefined,
    limit: numberParam(query.get('limit'), 1, 100),
    offset: numberParam(query.get('offset'), 0, 10_000),
  });
  const cacheControl = isProductRadarEnabled()
    ? `public, s-maxage=${PRODUCT_RADAR_CACHE_SECONDS}, stale-while-revalidate=600`
    : 'private, no-store';
  return NextResponse.json(feed, { headers: { 'Cache-Control': cacheControl } });
}
