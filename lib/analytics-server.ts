import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { requestHasAdminSession } from './admin-session';
import { createServerSupabase } from './server-supabase';
import { analyticsDay, type AnalyticsKind } from './analytics';

const COOKIE = 'aiopc_visitor';
const signature = (id: string) => createHmac('sha256', process.env.ADMIN_PASSWORD || process.env.SUPABASE_SERVICE_ROLE_KEY || 'unconfigured').update('analytics:' + id).digest('hex');
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export function analyticsVisitor(request: Request): string | null {
  const raw = request.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!raw) return null;
  const [id, mac, extra] = raw.split('.');
  if (!isUuid(id) || !mac || extra) return null;
  const expected = Buffer.from(signature(id)); const actual = Buffer.from(mac);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : null;
}
export function newAnalyticsVisitor() { return randomUUID(); }
export function visitorCookie(id: string) {
  return `${COOKIE}=${id}.${signature(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export async function recordAnalytics(kind: AnalyticsKind, options: {
  request?: Request; visitorId?: string | null; userId?: string | null; objectId?: string; key: string;
}): Promise<boolean> {
  if (options.request && (requestHasAdminSession(options.request) || options.request.headers.get('dnt') === '1' || options.request.headers.get('sec-gpc') === '1')) return true;
  const db = createServerSupabase(true);
  if (!db) return false;
  try {
    const { error } = await db.from('analytics_events').upsert({
      kind, visitor_id: options.visitorId ?? (options.request ? analyticsVisitor(options.request) : null),
      user_id: options.userId || null, object_id: options.objectId || null, dedupe_key: options.key,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true }).abortSignal(AbortSignal.timeout(2500));
    if (error) console.warn('Analytics write unavailable:', error.code);
    return !error;
  } catch { console.warn('Analytics write unavailable'); return false; }
}
export async function recordSavedResult(request: Request, userId: string, session: { id: string; plans?: Record<string, unknown> }) {
  const hasPlan = Object.values(session.plans || {}).some(p => {
    if (!p || typeof p !== 'object') return false;
    const plan = p as { firstStep?: unknown; analyticsCompletionId?: unknown; analyticsSource?: unknown };
    return typeof plan.firstStep === 'string' && plan.firstStep.trim() && isUuid(plan.analyticsCompletionId) && ['server', 'custom'].includes(String(plan.analyticsSource));
  });
  if (!hasPlan) return;
  await recordAnalytics('result_saved', { request, userId, objectId: session.id, key: `saved:${userId}:${session.id}:${analyticsDay()}` });
}
/** Reserved for a future signature-verified payment webhook ONLY; no public payment event endpoint. */
export async function recordVerifiedPayment(userId: string, provider: string, transactionId: string) {
  if (!isUuid(userId) || !/^[a-z0-9_-]{1,30}$/.test(provider) || !transactionId || transactionId.length > 160) throw new Error('Invalid verified payment identity');
  return recordAnalytics('payment_completed', { userId, objectId: `${provider}:${transactionId}`, key: `paid:${provider}:${transactionId}` });
}
