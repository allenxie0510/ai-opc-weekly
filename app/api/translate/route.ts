/**
 * POST /api/translate — 翻译推文（带缓存）
 * body: { tweet_id: string, text: string }
 * 先查 Supabase translated_text 缓存，没有再调 Google Translate
 */
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function googleTranslate(text: string): Promise<string> {
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`
  );
  const data = await res.json();
  return data[0]?.map((s: [string]) => s[0]).join('') || '';
}

export async function POST(req: Request) {
  try {
    const { tweet_id, text } = await req.json();
    if (!tweet_id || !text) {
      return Response.json({ error: '缺少 tweet_id 或 text' }, { status: 400 });
    }

    // 1. 查缓存
    const { data: cached } = await supabase
      .from('tweets')
      .select('translated_text')
      .eq('tweet_id', tweet_id)
      .single();

    if (cached?.translated_text) {
      return Response.json({ translated_text: cached.translated_text, cached: true });
    }

    // 2. 翻译
    const result = await googleTranslate(text);
    if (!result) {
      return Response.json({ error: '翻译失败' }, { status: 500 });
    }

    // 3. 写入缓存
    await supabase
      .from('tweets')
      .update({ translated_text: result })
      .eq('tweet_id', tweet_id);

    return Response.json({ translated_text: result, cached: false });
  } catch (e: unknown) {
    return Response.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
