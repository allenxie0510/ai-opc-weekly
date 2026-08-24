import type { AIProductAnalysis } from './providers/contracts';

function isShortStringArray(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 240);
}

export function validateAIProductAnalysis(value: unknown): AIProductAnalysis | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.whyNow !== 'string' || data.whyNow.trim().length === 0 || data.whyNow.length > 800) return null;
  if (!isShortStringArray(data.contentabilityReasons, 5)) return null;
  if (!isShortStringArray(data.contentAngles, 5)) return null;
  if (!isShortStringArray(data.limitations, 8)) return null;
  return data as unknown as AIProductAnalysis;
}
