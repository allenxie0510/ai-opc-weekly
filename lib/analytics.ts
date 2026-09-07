export type AnalyticsKind = 'visit' | 'opportunity_read' | 'registered' | 'active' | 'research_completed' | 'result_saved' | 'payment_completed';
export type AnalyticsEvent = {
  kind: AnalyticsKind; visitor_id: string | null; user_id: string | null;
  object_id: string | null; occurred_at: string;
};
export function analyticsDay(value: string | number = Date.now()): string {
  return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export function analyticsStart(days: number, now = Date.now()): string {
  return new Date(Date.parse(analyticsDay(now) + 'T00:00:00+08:00') - (days - 1) * 86400000).toISOString();
}
export function metricTotals(events: AnalyticsEvent[]) {
  const distinct = (kind: AnalyticsKind, key: 'visitor_id' | 'user_id') => new Set(events.filter(e => e.kind === kind && e[key]).map(e => e[key])).size;
  return {
    visitors: distinct('visit', 'visitor_id'), registrations: distinct('registered', 'user_id'),
    activeUsers: new Set(events.filter(e => e.user_id && ['active', 'research_completed', 'result_saved', 'payment_completed'].includes(e.kind)).map(e => e.user_id)).size,
    completions: events.filter(e => e.kind === 'research_completed').length,
    savers: distinct('result_saved', 'user_id'),
  };
}
/** Strict in-window visitor cohort. Existing users may be active but cannot be new signups. */
export function conversionFunnel(events: AnalyticsEvent[]) {
  const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const usersByVisitor = new Map<string, Set<string>>();
  const byVisitor = new Map<string, AnalyticsEvent[]>();
  const byUser = new Map<string, AnalyticsEvent[]>();
  for (const e of sorted) {
    if (e.visitor_id) { const rows = byVisitor.get(e.visitor_id) || []; rows.push(e); byVisitor.set(e.visitor_id, rows); }
    if (e.user_id) { const rows = byUser.get(e.user_id) || []; rows.push(e); byUser.set(e.user_id, rows); }
  }
  for (const e of sorted) if (e.visitor_id && e.user_id) {
    const users = usersByVisitor.get(e.visitor_id) || new Set<string>();
    users.add(e.user_id); usersByVisitor.set(e.visitor_id, users);
  }
  const counts = [0, 0, 0, 0, 0];
  for (const visitor of new Set(sorted.filter(e => e.kind === 'visit').map(e => e.visitor_id).filter(Boolean))) {
    const visitorEvents = byVisitor.get(visitor!) || [];
    const visit = visitorEvents.find(e => e.kind === 'visit')!;
    counts[0]++;
    const read = visitorEvents.find(e => e.kind === 'opportunity_read' && e.occurred_at >= visit.occurred_at);
    if (!read) continue;
    counts[1]++;
    const registrations = [...(usersByVisitor.get(visitor!) || [])].flatMap(user => (byUser.get(user) || []).filter(e => e.kind === 'registered' && e.occurred_at >= read.occurred_at));
    if (!registrations.length) continue;
    counts[2]++;
    // Keep the same registered user through completion and saving (shared devices).
    const completed = registrations.flatMap(r => (byUser.get(r.user_id!) || []).filter(e => e.kind === 'research_completed' && e.occurred_at >= r.occurred_at));
    if (!completed.length) continue;
    counts[3]++;
    if (completed.some(c => (byUser.get(c.user_id!) || []).some(e => ['result_saved', 'payment_completed'].includes(e.kind) && e.occurred_at >= c.occurred_at))) counts[4]++;
  }
  return counts;
}
export function buildAnalytics(events: AnalyticsEvent[], startedAt: string, now = Date.now()) {
  const valid = events.filter(e => Number.isFinite(Date.parse(e.occurred_at)) && Date.parse(e.occurred_at) <= now).map(e => ({ ...e, occurred_at: new Date(e.occurred_at).toISOString() }));
  const days = Array.from({ length: 30 }, (_, i) => {
    const day = analyticsDay(now - (29 - i) * 86400000);
    const covered = day >= analyticsDay(startedAt);
    return { day, covered, ...metricTotals(valid.filter(e => analyticsDay(e.occurred_at) === day)) };
  });
  const periods = [7, 30].map(length => {
    const rows = valid.filter(e => e.occurred_at >= analyticsStart(length, now));
    return { days: length, totals: metricTotals(rows), funnel: conversionFunnel(rows) };
  });
  return { startedAt, generatedAt: new Date(now).toISOString(), today: days[29], days, periods };
}
export type AnalyticsOverview = ReturnType<typeof buildAnalytics> & { legacyTotal: number | null; paymentsEnabled: false };
