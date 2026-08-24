import type { ProductOpportunity, ProductRadarDataMode, ProductSignal, SupplyOffer } from '../domain';

export interface ProviderHealth {
  provider: string;
  mode: ProductRadarDataMode;
  status: 'ok' | 'fallback' | 'unavailable';
  message: string;
}

export interface XhsTrendProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
  fetchSignals(): Promise<ProductSignal[]>;
}

export interface SupplyProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
  findOffers(query: string): Promise<SupplyOffer[]>;
}

export interface AIProductAnalysis {
  whyNow: string;
  contentabilityReasons: string[];
  contentAngles: string[];
  limitations: string[];
}

export interface AIProvider {
  readonly name: string;
  health(): Promise<ProviderHealth>;
  analyze(opportunity: ProductOpportunity): Promise<AIProductAnalysis>;
}

export interface ProductRadarProviders {
  trend: XhsTrendProvider;
  supply: SupplyProvider;
  ai: AIProvider;
}
