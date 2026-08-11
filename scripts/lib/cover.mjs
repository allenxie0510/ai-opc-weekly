/**
 * AI OPC · 机会封面共享库（Stage 4 / 回填脚本共用）
 *
 * 流程：title + thesis + category → 英文概念图 prompt
 *   → 智谱 CogView（cogview-3-flash）文生图（临时 URL）
 *   → 下载字节 → 上传 Supabase Storage bucket `covers`（公开）
 *   → 返回公共 URL；任何一步失败返回 ''（不阻塞主流程，前端有兜底封面）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ZHIPU_API_KEY
 * 前置条件：opportunities 表已有 cover_url 列
 *   alter table opportunities add column if not exists cover_url text;
 */

const COGVIEW_API = 'https://open.bigmodel.cn/api/paas/v4/images/generations';
const COGVIEW_MODEL = 'cogview-3-flash';
// 尺寸降级链：首选 1728x960（16:10），失败退 1440x810，再失败让模型用默认尺寸
const SIZE_CHAIN = ['1728x960', '1440x810', null];
const BUCKET = 'covers';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 构造统一风格的英文概念图 prompt */
export function buildCoverPrompt({ title, thesis, category }) {
  const concept = `${title || ''}. ${thesis || ''}`.trim().slice(0, 300);
  const catHint = category ? ` Domain: ${String(category).replace(/-/g, ' ')}.` : '';
  return `Minimalist flat editorial illustration for a tech startup intelligence report. Concept: ${concept}.${catHint} Style: flat vector, geometric shapes, muted sophisticated color palette with a single warm amber accent, generous negative space, no text, no letters, no words, no people faces. 16:10 composition.`;
}

/** 调 CogView 生成一张图，返回临时 URL；失败抛错 */
async function cogviewGenerate(zk, prompt) {
  let lastErr;
  for (let i = 0; i < SIZE_CHAIN.length; i++) {
    const size = SIZE_CHAIN[i];
    // 429 / 超时友好重试 1 次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const body = { model: COGVIEW_MODEL, prompt };
        if (size) body.size = size;
        const res = await fetch(COGVIEW_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zk}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90000),
        });
        const txt = await res.text();
        if (!res.ok) {
          const err = new Error(`CogView ${res.status}: ${txt.slice(0, 150)}`);
          err.congested = res.status === 429;
          // size 不被接受时直接走下一条尺寸链，不重试
          if (size && /size/i.test(txt)) err.sizeRejected = true;
          throw err;
        }
        const url = JSON.parse(txt).data?.[0]?.url;
        if (!url) throw new Error('CogView 响应无 data[0].url');
        return url;
      } catch (e) {
        lastErr = e;
        if (e.sizeRejected) {
          console.log(`   ⚠️ CogView 拒绝尺寸 ${size}，降级重试...`);
          break;
        }
        if (e.congested && attempt === 0) {
          console.log(`   ⚠️ CogView 拥挤(429)，15s 后重试...`);
          await sleep(15000);
          continue;
        }
        // 其他错误（超时/无 URL）：同一尺寸不再重试，走下一条尺寸链
        break;
      }
    }
  }
  throw lastErr;
}

/** 确保 Storage bucket 存在（409 / 已存在则忽略） */
async function ensureBucket(supabaseUrl, srk) {
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        apikey: srk,
        Authorization: `Bearer ${srk}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
    });
    if (res.ok || res.status === 409) return;
    const txt = await res.text();
    if (/already exists|duplicate/i.test(txt)) return;
    console.log(`   ⚠️ 创建 bucket 失败（继续尝试上传）: SB ${res.status} ${txt.slice(0, 100)}`);
  } catch (e) {
    console.log(`   ⚠️ 创建 bucket 异常（继续尝试上传）: ${e.message.slice(0, 60)}`);
  }
}

/** 上传图片字节到 covers bucket，返回公共 URL */
async function uploadToStorage(supabaseUrl, srk, filename, bytes) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: {
      apikey: srk,
      Authorization: `Bearer ${srk}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Storage 上传失败 ${res.status}: ${txt.slice(0, 150)}`);
  }
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`;
}

/**
 * 为一个机会生成概念图封面并上传，返回公共 URL；失败返回 ''（绝不抛错）
 * @param {{ title: string, thesis?: string, category?: string, slug?: string, id?: string }} opp
 */
export async function generateOpportunityCover(opp) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const zk = process.env.ZHIPU_API_KEY;
  if (!supabaseUrl || !srk || !zk) {
    console.log('   ⚠️ 缺少封面生成环境变量，跳过封面');
    return '';
  }
  try {
    const prompt = buildCoverPrompt(opp);
    const tmpUrl = await cogviewGenerate(zk, prompt);

    // 下载临时图片字节
    const imgRes = await fetch(tmpUrl, { signal: AbortSignal.timeout(30000) });
    if (!imgRes.ok) throw new Error(`下载图片失败 HTTP ${imgRes.status}`);
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    if (bytes.length < 1024) throw new Error(`图片字节异常（${bytes.length}B）`);

    await ensureBucket(supabaseUrl, srk);
    const name = (opp.slug || opp.id || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60);
    const filename = `opp-${name}.png`;
    return await uploadToStorage(supabaseUrl, srk, filename, bytes);
  } catch (e) {
    console.log(`   ⚠️ 封面生成失败（不阻塞，cover_url 留空）: ${e.message.slice(0, 100)}`);
    return '';
  }
}
