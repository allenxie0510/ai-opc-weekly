import { analyticsDay } from '@/lib/analytics';
import { analyticsVisitor, isUuid, newAnalyticsVisitor, recordAnalytics, visitorCookie } from '@/lib/analytics-server';
import { requireUser } from '@/lib/explore-auth';
import { requestHasAdminSession } from '@/lib/admin-session';
import { createServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const hits = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Forbidden' }, { status: 403 });
  if (requestHasAdminSession(request) || request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return new Response(null, { status: 204 });
  if (/bot|crawler|spider|headless/i.test(request.headers.get('user-agent') || '')) return new Response(null, { status: 204 });
  const raw = await request.text();
  if (raw.length > 2048) return Response.json({ error: 'Payload too large' }, { status: 413 });
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || !['visit', 'opportunity_read', 'active', 'research_completed'].includes(body.kind)) return Response.json({ error: 'Invalid event' }, { status: 400 });
  const previousVisitor = analyticsVisitor(request);
  const visitorId = previousVisitor || newAnalyticsVisitor();
  const now = Date.now();
  if (hits.size > 5000) for (const [key, value] of hits) if (value.until < now) hits.delete(key);
  const hit = hits.get(visitorId);
  if (hit && hit.until > now && hit.count >= 60) return Response.json({ error: 'Too many events' }, { status: 429 });
  hits.set(visitorId, { count: hit && hit.until > now ? hit.count + 1 : 1, until: hit && hit.until > now ? hit.until : now + 60000 });
  let userId: string | null = null;
  if (request.headers.has('authorization') || ['active', 'research_completed'].includes(body.kind)) {
    const auth = await requireUser(request);
    if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status });
    userId = auth.userId;
  }
  let objectId: string | undefined;
  if (body.kind === 'opportunity_read') {
    if (typeof body.objectId !== 'string' || !/^[\w\u4e00-\u9fff-]{1,160}$/.test(body.objectId)) return Response.json({ error: 'Invalid opportunity' }, { status: 400 });
    objectId = body.objectId;
    const db = createServerSupabase(true);
    if (!db) return Response.json({ error: 'Not configured' }, { status: 503 });
    try {
      const { data, error } = await db.from('opportunities').select('id').eq('slug', objectId).eq('status', 'published').abortSignal(AbortSignal.timeout(2500)).maybeSingle();
      if (error) return Response.json({ error: 'Unavailable' }, { status: 503 });
      if (!data) return Response.json({ error: 'Opportunity not found' }, { status: 404 });
    } catch { return Response.json({ error: 'Unavailable' }, { status: 503 }); }
  }
  if (body.kind === 'research_completed') {
    if (!isUuid(body.objectId) || !['server', 'custom'].includes(body.source)) return Response.json({ error: 'Invalid completion' }, { status: 400 });
    objectId = body.objectId;
  }
  const key = body.kind === 'research_completed' ? `completed:${userId}:${objectId}` : `${body.kind}:${body.kind === 'active' ? `${userId}:${visitorId}` : visitorId}:${analyticsDay()}:${objectId || ''}`;
  const ok = await recordAnalytics(body.kind, { request, visitorId, userId, objectId, key });
  if (!ok) return Response.json({ error: 'Analytics not configured' }, { status: 503 });
  // An authenticated page visit counts as activity even if today's anonymous visit already existed.
  if (userId && body.kind !== 'active') await recordAnalytics('active', { request, visitorId, userId, key: `active:${userId}:${visitorId}:${analyticsDay()}:` });
  return new Response(null, { status: 204, headers: previousVisitor ? {} : { 'Set-Cookie': visitorCookie(visitorId) } });
}
