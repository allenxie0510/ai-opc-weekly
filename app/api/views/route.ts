import { createServerSupabase } from '@/lib/server-supabase';
import { requestHasAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  if (!requestHasAdminSession(request)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  const supabase = createServerSupabase(true);
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503, headers });
  const { data, error } = await supabase.from('page_views').select('count').eq('key','total').maybeSingle();
  if (error) return Response.json({ error: 'Unavailable' }, { status: 503, headers });
  return Response.json({ count: data?.count ?? null }, { headers });
}

// Retired endpoint: old clients cannot read totals or increment the legacy counter.
export async function POST() { return new Response(null, { status: 410 }); }
