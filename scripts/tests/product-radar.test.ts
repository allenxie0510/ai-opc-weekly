import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateConfidenceScore, calculateOpportunityScore, classifyDecision, classifyOpportunityStage } from '../../lib/product-radar/scoring';
import { calculateProfit, normalizeProfitInput } from '../../lib/product-radar/profit';
import { getFixtureOpportunities } from '../../lib/product-radar/fixtures';
import { FixtureProductRadarRepository } from '../../lib/product-radar/repository';
import { validateAIProductAnalysis } from '../../lib/product-radar/validation';
import { isProductRadarEnabled, isToolsEnabled } from '../../lib/product-radar/config';

test('tools product layer is opt-in and gates the product radar', () => {
  const keys = ['TOOLS_ENABLED', 'NEXT_PUBLIC_TOOLS_ENABLED', 'XHS_PRODUCT_RADAR_ENABLED', 'NEXT_PUBLIC_XHS_PRODUCT_RADAR_ENABLED'] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    keys.forEach((key) => delete process.env[key]);
    assert.equal(isToolsEnabled(), false);
    assert.equal(isProductRadarEnabled(), false);

    process.env.TOOLS_ENABLED = 'true';
    assert.equal(isToolsEnabled(), true);
    assert.equal(isProductRadarEnabled(), true);

    process.env.XHS_PRODUCT_RADAR_ENABLED = 'false';
    assert.equal(isProductRadarEnabled(), false);
  } finally {
    keys.forEach((key) => {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('opportunity score uses documented weights and caps risk penalty at 20', () => {
  const score = calculateOpportunityScore({ momentum: 100, contentability: 80, competitionGap: 60, supplyFit: 40, margin: 20, timing: 0 }, 30);
  assert.equal(score.baseScore, 59);
  assert.equal(score.riskPenalty, 20);
  assert.equal(score.finalScore, 39);
});

test('confidence is independent from opportunity score', () => {
  assert.equal(calculateConfidenceScore({ completeness: 100, freshness: 80, providerReliability: 60, crossSourceAgreement: 40 }), 73);
});

test('decision bands, confidence cap, evidence C cap and blocked risk are deterministic', () => {
  assert.equal(classifyDecision(90, 90, 'low', 'A'), '值得测试');
  assert.equal(classifyDecision(80, 90, 'low', 'A'), '小规模测试');
  assert.equal(classifyDecision(90, 49, 'low', 'A'), '保持关注');
  assert.equal(classifyDecision(90, 90, 'low', 'C'), '保持关注');
  assert.equal(classifyDecision(95, 95, 'blocked', 'A'), '暂不建议');
});

test('stage classifier recognizes all five lifecycle states', () => {
  assert.equal(classifyOpportunityStage({ trend7dGrowth: -1, trend30dGrowth: -1, acceleration: 0, demandStrength: 80, competitionDensity: 80 }), 'declining');
  assert.equal(classifyOpportunityStage({ trend7dGrowth: 10, trend30dGrowth: 20, acceleration: 0, demandStrength: 70, competitionDensity: 85 }), 'crowded');
  assert.equal(classifyOpportunityStage({ trend7dGrowth: 40, trend30dGrowth: 30, acceleration: 20, demandStrength: 90, competitionDensity: 60 }), 'breakout');
  assert.equal(classifyOpportunityStage({ trend7dGrowth: 25, trend30dGrowth: 18, acceleration: 10, demandStrength: 60, competitionDensity: 40 }), 'accelerating');
  assert.equal(classifyOpportunityStage({ trend7dGrowth: 12, trend30dGrowth: 14, acceleration: 4, demandStrength: 50, competitionDensity: 30 }), 'emerging');
});

test('profit calculation exposes contribution margin and break-even promotion cost', () => {
  const result = calculateProfit({ retailPrice: 100, unitCost: 30, shippingCost: 5, packagingCost: 2, platformFeeRate: 5, returnAllowanceRate: 8, promotionCost: 10 });
  assert.equal(result.platformFee, 5);
  assert.equal(result.returnAllowance, 8);
  assert.equal(result.contributionProfit, 40);
  assert.equal(result.contributionMargin, 40);
  assert.equal(result.breakEvenPromotionCost, 50);
  assert.equal(normalizeProfitInput({ retailPrice: -1 }).retailPrice, 0.01);
});

test('fixture set contains required stage coverage and boundary cases', () => {
  const items = getFixtureOpportunities(new Date('2026-08-24T04:00:00Z'));
  assert.equal(items.length, 12);
  const counts = items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.stage]: (acc[item.stage] ?? 0) + 1 }), {});
  assert.deepEqual(counts, { accelerating: 4, breakout: 2, crowded: 2, emerging: 3, declining: 1 });
  assert.ok(items.some((item) => item.supplyOffers.length === 0));
  assert.ok(items.some((item) => item.evidenceGrade === 'C' && item.decision === '保持关注'));
  assert.ok(items.some((item) => item.riskLevel === 'blocked' && item.decision === '暂不建议'));
  assert.ok(items.some((item) => item.confidence >= 80 && item.score.finalScore < 50));
  assert.ok(items.some((item) => item.score.finalScore >= 85 && item.confidence < 50));
  assert.ok(items.some((item) => item.trend7d.length === 0));
});

test('fixture repository filters normalized fields, dropship and calculated margin', async () => {
  const repo = new FixtureProductRadarRepository(new Date('2026-08-24T04:00:00Z'));
  const feed = await repo.list({ stage: 'accelerating', onePieceDropship: true, minMargin: 20 });
  assert.ok(feed.items.length > 0);
  assert.ok(feed.items.every((item) => item.stage === 'accelerating'));
  assert.ok(feed.items.every((item) => item.supplyOffers.some((offer) => offer.onePieceDropship)));
});

test('AI semantic output validation rejects unbounded or malformed responses', () => {
  assert.ok(validateAIProductAnalysis({ whyNow: '有效理由', contentabilityReasons: ['对比强'], contentAngles: ['角度'], limitations: ['Fixture'] }));
  assert.equal(validateAIProductAnalysis({ whyNow: '', contentabilityReasons: [], contentAngles: [], limitations: [] }), null);
  assert.equal(validateAIProductAnalysis({ whyNow: '理由', contentabilityReasons: [], contentAngles: Array(6).fill('过多'), limitations: [] }), null);
});
