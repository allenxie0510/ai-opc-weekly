import type { ProductRadarDataMode } from './domain';

export function isProductRadarEnabled(): boolean {
  const value = process.env.XHS_PRODUCT_RADAR_ENABLED ?? process.env.NEXT_PUBLIC_XHS_PRODUCT_RADAR_ENABLED;
  return value?.toLowerCase() !== 'false';
}

export function getProductRadarDataMode(): ProductRadarDataMode {
  return process.env.PRODUCT_RADAR_DATA_MODE === 'live' ? 'live' : 'fixture';
}

export const PRODUCT_RADAR_CACHE_SECONDS = 300;
export const PRODUCT_RADAR_STALE_HOURS = 48;
export const PRODUCT_RADAR_RANKING_MAX_AGE_DAYS = 7;

export function ageInHours(isoDate: string, now = new Date()): number {
  return Math.max(0, (now.getTime() - new Date(isoDate).getTime()) / 3_600_000);
}

export function isStale(isoDate: string, now = new Date()): boolean {
  return ageInHours(isoDate, now) > PRODUCT_RADAR_STALE_HOURS;
}

export function isEligibleForTodayRanking(isoDate: string, now = new Date()): boolean {
  return ageInHours(isoDate, now) <= PRODUCT_RADAR_RANKING_MAX_AGE_DAYS * 24;
}
