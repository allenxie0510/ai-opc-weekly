import { createClient } from '@supabase/supabase-js';
import { getFixtureOpportunities, getFixtureRunSummary } from '../lib/product-radar/fixtures';
import { getProductRadarProviders } from '../lib/product-radar/providers';

async function main() {
  const persist = process.argv.includes('--persist');
  const now = new Date();
  const providers = getProductRadarProviders();
  const [trendHealth, supplyHealth, aiHealth, signals] = await Promise.all([
    providers.trend.health(), providers.supply.health(), providers.ai.health(), providers.trend.fetchSignals(),
  ]);
  const opportunities = getFixtureOpportunities(now);
  const summary = {
    ...getFixtureRunSummary(now),
    scannedSignals: signals.length,
    providerStatus: [trendHealth, supplyHealth, aiHealth],
  };

  console.info(JSON.stringify({ event: 'product_radar_pipeline', persist, summary, scores: opportunities.map((item) => ({ slug: item.slug, score: item.score.finalScore, confidence: item.confidence, decision: item.decision })) }, null, 2));
  if (!persist) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('--persist requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: run, error: runError } = await client.from('product_radar_runs').upsert({
    run_key: summary.runId,
    mode: summary.mode,
    status: summary.status,
    started_at: summary.startedAt,
    finished_at: summary.finishedAt,
    summary,
  }, { onConflict: 'run_key' }).select('id').single();
  if (runError) throw runError;

  const rows = opportunities.map((item) => ({
    external_id: item.id,
    slug: item.slug,
    title: item.title,
    category: item.category,
    stage: item.stage,
    score: item.score.finalScore,
    confidence: item.confidence,
    evidence_grade: item.evidenceGrade,
    decision: item.decision,
    risk_level: item.riskLevel,
    data_mode: item.dataMode,
    data_as_of: item.dataAsOf,
    status: 'published',
    run_id: run.id,
    payload: item,
    published_at: summary.finishedAt,
    updated_at: summary.finishedAt,
  }));
  const { error } = await client.from('product_opportunities').upsert(rows, { onConflict: 'external_id' });
  if (error) throw error;
  console.info(JSON.stringify({ event: 'product_radar_published', count: rows.length, runId: run.id }));
}

main().catch((error) => {
  console.error('[product-radar-pipeline]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
