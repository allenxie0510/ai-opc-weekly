import type { ProfitDefaults } from './domain';

export interface ProfitResult extends ProfitDefaults {
  platformFee: number;
  returnAllowance: number;
  totalVariableCost: number;
  contributionProfit: number;
  contributionMargin: number;
  breakEvenPromotionCost: number;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizeProfitInput(input: Partial<ProfitDefaults>): ProfitDefaults {
  return {
    retailPrice: bounded(input.retailPrice, 0.01, 100_000, 59),
    unitCost: bounded(input.unitCost, 0, 100_000, 15),
    shippingCost: bounded(input.shippingCost, 0, 10_000, 6),
    packagingCost: bounded(input.packagingCost, 0, 10_000, 1),
    platformFeeRate: bounded(input.platformFeeRate, 0, 100, 5),
    returnAllowanceRate: bounded(input.returnAllowanceRate, 0, 100, 8),
    promotionCost: bounded(input.promotionCost, 0, 100_000, 8),
  };
}

export function calculateProfit(raw: Partial<ProfitDefaults>): ProfitResult {
  const input = normalizeProfitInput(raw);
  const platformFee = input.retailPrice * (input.platformFeeRate / 100);
  const returnAllowance = input.retailPrice * (input.returnAllowanceRate / 100);
  const fixedBeforePromotion = input.unitCost + input.shippingCost + input.packagingCost + platformFee + returnAllowance;
  const totalVariableCost = fixedBeforePromotion + input.promotionCost;
  const contributionProfit = input.retailPrice - totalVariableCost;
  const contributionMargin = input.retailPrice > 0 ? (contributionProfit / input.retailPrice) * 100 : 0;
  return {
    ...input,
    platformFee: money(platformFee),
    returnAllowance: money(returnAllowance),
    totalVariableCost: money(totalVariableCost),
    contributionProfit: money(contributionProfit),
    contributionMargin: money(contributionMargin),
    breakEvenPromotionCost: money(Math.max(0, input.retailPrice - fixedBeforePromotion)),
  };
}
