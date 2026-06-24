import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  const { data } = await supabase.from('page_views').select('count').eq('key','total').single();
  return Response.json({ count: data?.count || 0 });
}

export async function POST(req: Request) {
  const { uid } = await req.json().catch(() => ({}));
  if (!uid) return Response.json({ error: 'missing uid' }, { status: 400 });

  const today = new Date().toISOString().slice(0,10);
  const { data: exist } = await supabase.from('page_views_log').select('id').eq('uid',uid).eq('date',today).limit(1);
  
  if (!exist?.length) {
    await supabase.from('page_views_log').insert({ uid, date: today });
    await supabase.rpc('increment_view_count').catch(async () => {
      const r = await supabase.from('page_views').select('count').eq('key','total').single();
      await supabase.from('page_views').upsert({ key:'total', count:(r.data?.count||0)+1 }, { onConflict: 'key' });
    });
  }

  const { data } = await supabase.from('page_views').select('count').eq('key','total').single();
  return Response.json({ count: data?.count || 0 });
}
