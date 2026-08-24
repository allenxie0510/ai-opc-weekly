import { getFixtureOpportunities } from '../fixtures';
import type { ProductOpportunity } from '../domain';
import type { AIProductAnalysis, AIProvider, ProviderHealth, SupplyProvider, XhsTrendProvider } from './contracts';

export class FixtureXhsTrendProvider implements XhsTrendProvider {
  readonly name = 'XHS Trend Fixture';

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, mode: 'fixture', status: 'fallback', message: '使用本地演示信号，未访问小红书受限页面。' };
  }

  async fetchSignals() {
    return getFixtureOpportunities().flatMap((item) => item.topSignals.filter((signal) => signal.provider === this.name));
  }
}

export class FixtureSupplyProvider implements SupplyProvider {
  readonly name = '1688 Fixture';

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, mode: 'fixture', status: 'fallback', message: '使用本地演示供应数据；外链只指向 1688 公开搜索入口。' };
  }

  async findOffers(query: string) {
    const normalized = query.trim().toLowerCase();
    const match = getFixtureOpportunities().find((item) =>
      item.title.toLowerCase().includes(normalized) || item.slug.includes(normalized),
    );
    return match?.supplyOffers ?? [];
  }
}

export class FixtureAIProvider implements AIProvider {
  readonly name = 'AI Analysis Fixture';

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, mode: 'fixture', status: 'fallback', message: '使用已验证结构的演示分析，页面请求时不调用 LLM。' };
  }

  async analyze(opportunity: ProductOpportunity): Promise<AIProductAnalysis> {
    return {
      whyNow: opportunity.whyNow,
      contentabilityReasons: opportunity.contentabilityReasons.slice(0, 5),
      contentAngles: opportunity.contentAngles.slice(0, 5),
      limitations: opportunity.limitations,
    };
  }
}
