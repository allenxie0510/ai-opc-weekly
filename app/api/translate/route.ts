/**
 * POST /api/translate — 翻译推文（带缓存）
 * body: { tweet_id: string, text: string }
 * 先查 Supabase translated_text 缓存，没有再调 DeepSeek
 */
import { createServerSupabase } from '@/lib/server-supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEEPSEEK_ENDPOINT = (process.env.DEEPSEEK_API_ENDPOINT || 'https://api.deepseek.com')
  .replace(/\/$/, '');
const DEEPSEEK_MODEL = process.env.DEEPSEEK_TRANSLATE_MODEL || 'deepseek-v4-flash';
const MAX_TEXT_LENGTH = 5_000;

async function deepSeekTranslate(text: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('服务端未配置 DEEPSEEK_API_KEY');
  }

  const res = await fetch(`${DEEPSEEK_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.1,
      max_tokens: 4_096,
      messages: [
        {
          role: 'system',
          content: [
            '你是专业的社交媒体翻译。',
            '将用户提供的推文准确翻译为简体中文。',
            '保留 URL、@username、#hashtag、emoji、产品名和原有换行。',
            '已经是中文的内容保持原意，不要添加解释、标题、引号或前后缀。',
            '只输出翻译结果。',
          ].join(''),
        },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek 上游错误 (${res.status}): ${responseText.slice(0, 200)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error('DeepSeek 返回无法解析');
  }

  const result = (data as {
    choices?: Array<{ message?: { content?: unknown } }>;
  })?.choices?.[0]?.message?.content;

  if (typeof result !== 'string' || !result.trim()) {
    throw new Error('DeepSeek 返回空内容');
  }
  return result.trim();
}

export async function POST(req: Request) {
  try {
    const { tweet_id, text } = await req.json();
    if (typeof tweet_id !== 'string' || typeof text !== 'string' || !tweet_id.trim() || !text.trim()) {
      return Response.json({ error: '缺少 tweet_id 或 text' }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return Response.json({ error: `文本过长，最多 ${MAX_TEXT_LENGTH} 个字符` }, { status: 400 });
    }

    const supabase = createServerSupabase();
    // 1. 查缓存（Supabase 未配置时仍可直接翻译）
    const { data: cached } = supabase ? await supabase
      .from('tweets')
      .select('translated_text')
      .eq('tweet_id', tweet_id)
      .single() : { data: null };

    if (cached?.translated_text) {
      return Response.json({ translated_text: cached.translated_text, cached: true });
    }

    // 2. 翻译
    const result = await deepSeekTranslate(text);
    if (!result) {
      return Response.json({ error: '翻译失败' }, { status: 500 });
    }

    // 3. 写入缓存
    if (supabase) {
      await supabase
        .from('tweets')
        .update({ translated_text: result })
        .eq('tweet_id', tweet_id);
    }

    return Response.json({ translated_text: result, cached: false });
  } catch (e: unknown) {
    return Response.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
