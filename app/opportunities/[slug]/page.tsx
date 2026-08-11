import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getOpportunities, getOpportunityBySlug, getOpportunityCases, getOpportunitySignals } from '@/lib/data';
import { Header } from '@/components/page-shell';
import { PageViewCounter } from '@/components/page-view-counter';
import { CATEGORY_MAP, RECOMMENDATION_MAP, SCORE_DIMENSIONS } from '@/lib/types';
import type { Opportunity } from '@/lib/types';

export const revalidate = 300;

export async function generateStaticParams() {
  const opps = await getOpportunities();
  return opps.map(o => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const opp = await getOpportunityBySlug(slug);
  if (!opp) return { title: 'Not Found' };
  return {
    title: `${opp.title} · AI OPC 机会情报`,
    description: opp.thesis || `OPC Score ${opp.score_total} · ${opp.recommendation}`,
    openGraph: { title: opp.title, description: opp.thesis, type: 'article', publishedTime: opp.published_at },
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="opp-field">
      <div className="opp-field-label">{label}</div>
      <div className="opp-field-value">{children}</div>
    </div>
  );
}

function ScoreBar({ label, weight, value }: { label: string; weight: number; value: number }) {
  return (
    <div className="opp-scorebar">
      <span className="opp-scorebar-label">{label} <em>{weight}%</em></span>
      <span className="opp-scorebar-track">
        <span className="opp-scorebar-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      <span className="opp-scorebar-value">{value}</span>
    </div>
  );
}

const TIMING_MAP: Record<Opportunity['timing'], string> = {
  early: '偏早期',
  'right-time': '正当其时',
  late: '偏晚',
};

export default async function OpportunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opp = await getOpportunityBySlug(slug);
  if (!opp) notFound();

  const [cases, signals] = await Promise.all([
    getOpportunityCases(opp.case_ids || []),
    getOpportunitySignals(opp.signal_ids || []),
  ]);

  const rec = RECOMMENDATION_MAP[opp.recommendation] || RECOMMENDATION_MAP.WATCH;
  const cat = opp.category ? CATEGORY_MAP[opp.category] : null;
  const vp = opp.validation_plan || { hypothesis: '', steps: [], success_threshold: '', kill_condition: '' };
  const date = (opp.published_at || '').slice(0, 10);

  return (
    <>
      <Header />
      <div className="container opp-detail" style={{ paddingTop: 48, paddingBottom: 80, display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>

        <nav className="opp-breadcrumb"><Link href="/opportunities">← 机会情报</Link></nav>

        {/* ═══ 头部：判断先行 ═══ */}
        <header className="opp-hero">
          <div className="opp-hero-badges">
            <span className={`opp-rec lg ${rec.cssClass}`}>{rec.label}</span>
            <span className="opp-rec-desc">{rec.desc}{vp.recommendation_reason ? ` · ${vp.recommendation_reason}` : ''}</span>
          </div>
          <h1 className="opp-hero-title">{opp.title}</h1>
          {opp.thesis && <p className="opp-hero-thesis">{opp.thesis}</p>}
          <div className="opp-card-meta">
            <span className={`opp-evidence grade-${opp.evidence_grade}`}>Evidence {opp.evidence_grade}</span>
            {cat && <span className={`art-cat-pill ${cat.cssClass}`}>{cat.label}</span>}
            <span>{TIMING_MAP[opp.timing] || opp.timing}</span>
            <span>{date}</span>
          </div>
        </header>

        {/* ═══ OPC Score 七维 ═══ */}
        <section className="opp-section">
          <h2 className="opp-section-title">OPC SCORE <span className="opp-total">{opp.score_total}</span></h2>
          <div className="opp-scorebars">
            {SCORE_DIMENSIONS.map(d => (
              <ScoreBar key={d.key} label={d.label} weight={d.weight} value={Number(opp[d.key]) || 0} />
            ))}
          </div>
        </section>

        {/* ═══ 主编判断 ═══ */}
        {opp.editor_take && (
          <section className="opp-section opp-editor">
            <h2 className="opp-section-title">主编判断 {opp.editor_conviction && <span className="opp-conviction">信心 {opp.editor_conviction}</span>}</h2>
            <p className="opp-editor-take">{opp.editor_take}</p>
          </section>
        )}

        {/* ═══ 机会分析 ═══ */}
        <section className="opp-section">
          <h2 className="opp-section-title">机会分析</h2>
          <div className="opp-fields">
            <Field label="为什么是现在">{opp.why_now}</Field>
            <Field label="目标客户">{opp.customer}</Field>
            <Field label="痛点">{opp.pain}</Field>
            <Field label="谁付钱">{opp.who_pays}</Field>
            <Field label="商业模式">{opp.business_model}</Field>
            <Field label="定价参考">{opp.pricing_hint}</Field>
            <Field label="MVP 周期">{opp.mvp_weeks}</Field>
            <Field label="获客渠道">{opp.distribution}</Field>
            <Field label="竞争格局">{opp.competition}</Field>
            <Field label="平台风险">{opp.platform_risk}</Field>
            <Field label="最窄切入场景">{opp.mvp_wedge}</Field>
            <Field label="前 10 个客户">{opp.first_10_customers}</Field>
          </div>
          <div className="opp-bullbear">
            {opp.bull_case && <div className="opp-bull"><h3>为什么能成</h3><p>{opp.bull_case}</p></div>}
            {opp.bear_case && <div className="opp-bear"><h3>为什么会败</h3><p>{opp.bear_case}</p></div>}
          </div>
        </section>

        {/* ═══ Validation Plan ═══ */}
        {(vp.hypothesis || vp.steps.length > 0) && (
          <section className="opp-section">
            <h2 className="opp-section-title">验证计划 <span className="opp-section-sub">48–72h 内可执行</span></h2>
            {vp.hypothesis && <p className="opp-vp-hypothesis">待验证假设：{vp.hypothesis}</p>}
            {vp.steps.length > 0 && (
              <ol className="opp-vp-steps">
                {vp.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
            <div className="opp-vp-thresholds">
              {vp.success_threshold && <span className="opp-vp-pass">✓ 成功阈值：{vp.success_threshold}</span>}
              {vp.kill_condition && <span className="opp-vp-kill">✕ 止损条件：{vp.kill_condition}</span>}
            </div>
            {vp.niche_hint && <p className="opp-vp-niche">◈ 垂直切入建议：{vp.niche_hint}</p>}
          </section>
        )}

        {/* ═══ 真实案例 ═══ */}
        {cases.length > 0 && (
          <section className="opp-section">
            <h2 className="opp-section-title">真实案例</h2>
            <div className="opp-cases">
              {cases.map(c => (
                <div key={c.id} className="opp-case">
                  <div className="opp-case-head">
                    {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="opp-case-name">{c.name}</a>
                           : <span className="opp-case-name">{c.name}</span>}
                    <span className="opp-case-mrr">{c.mrr}</span>
                  </div>
                  <div className="opp-case-meta">
                    {[c.founder, c.team_size, c.pricing !== '未披露' ? c.pricing : ''].filter(Boolean).join(' · ')}
                  </div>
                  {c.revenue_type === 'founder_disclosed' && c.revenue_source_url ? (
                    <a href={c.revenue_source_url} target="_blank" rel="noopener noreferrer" className="provenance-badge verified" title={c.claim_quote || '创始人公开披露'}>✓ 创始人披露 · {c.source_name}</a>
                  ) : c.revenue_type === 'ai_estimate' ? (
                    <span className="provenance-badge estimate" title="有公开依据的间接估算，非官方披露">⚠ 估算 · {c.source_name}</span>
                  ) : (
                    <span className="provenance-badge estimate" title="未找到公开收入披露">— 收入未披露 · {c.source_name}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ 证据链 ═══ */}
        {opp.evidence && opp.evidence.length > 0 && (
          <section className="opp-section">
            <h2 className="opp-section-title">证据链 <span className="opp-section-sub">{opp.evidence.length} 条，URL 已经可达性校验</span></h2>
            <div className="opp-evidences">
              {opp.evidence.map((ev, i) => (
                <div key={i} className="opp-evi">
                  <div className="opp-evi-head">
                    <span className={`opp-tier tier-${ev.tier}`}>{ev.tier}</span>
                    <a href={ev.source_url} target="_blank" rel="noopener noreferrer" className="opp-evi-source">{ev.source_name}</a>
                  </div>
                  {ev.claim && <p className="opp-evi-claim">{ev.claim}</p>}
                  {ev.quote && <blockquote className="opp-evi-quote">{ev.quote}</blockquote>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ═══ 支撑信号 ═══ */}
        {signals.length > 0 && (
          <section className="opp-section">
            <h2 className="opp-section-title">支撑信号 <span className="opp-section-sub">{signals.length} 条雷达信号聚类成此机会</span></h2>
            <ul className="opp-signals">
              {signals.map(s => (
                <li key={s.id}>
                  <a href={s.source_url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                  <span className="opp-signal-source">{s.source_name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem', marginTop: 'auto' }}>
          <p style={{ marginBottom: 6 }}><PageViewCounter /></p>
          <p>机会判断由 AI 深研生成、主编拍板。不构成投资建议。</p>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
