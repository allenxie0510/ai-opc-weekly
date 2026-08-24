import type { ProductRadarProviders } from './contracts';
import { FixtureAIProvider, FixtureSupplyProvider, FixtureXhsTrendProvider } from './fixture';

/**
 * Provider selection is intentionally conservative. Until an authorized provider is configured,
 * the resolver always returns fixtures. It never falls back to scraping login-gated pages.
 */
export function getProductRadarProviders(): ProductRadarProviders {
  return {
    trend: new FixtureXhsTrendProvider(),
    supply: new FixtureSupplyProvider(),
    ai: new FixtureAIProvider(),
  };
}
