/**
 * AI OPC · 机会封面共享库（Stage 4 / 回填脚本共用）——两级管线
 *
 * Track 1 原图优先：evidence[].source_url 网页的 og:image → 下载转存 covers 桶
 *   （真实感最强、零 AI 感；文件名 opp-<slug>-og.<ext>）
 * Track 2 生成兜底：GLM 提炼静物隐喻场景（英文）→ Seedream 4.5 编辑静物摄影风
 *   → 下载字节 → 上传 covers 桶 → 公共 URL
 *
 * 铁律：
 * - 只用 Seedream 4.5，没有任何回退模型——生成失败 cover_url 留 null（前端有渐变兜底）
 * - 中文原文绝不进生图 prompt（模型会把原文当标注文字渲染进图）
 * - 任何一步失败返回 ''（不阻塞主流程，exit 0 不挂 workflow）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   Track 1 只需以上两个；Track 2 另需 ZHIPU_API_KEY（场景提炼）+ ARK_API_KEY（出图）
 * 前置条件：opportunities 表已有 cover_url 列
 *   alter table opportunities add column if not exists cover_url text;
 */

import { createHash } from 'node:crypto';
import { findEvidenceImage } from './ogimage.mjs';

/** 图片字节 sha256（内容级去重用；backfill 预载现有封面哈希也用它） */
export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const ZHIPU_CHAT_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
// 火山引擎 ARK（Seedream 4.5）：指令跟随/写实摄影国内第一梯队，"无文字"约束稳定生效
const ARK_API = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const SEEDREAM_MODEL = (process.env.SEEDREAM_MODEL || 'doubao-seedream-4-5-251128').trim();
const GLM_MODEL = 'glm-4.7-flash';
const BUCKET = 'covers';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Stage 4a: 用 GLM 从机会内容提炼一个静物隐喻场景（英文输出）。
 * 要求：一个静物隐喻物体 + 桌面/光线氛围，1-2 句英文。
 * 失败返回 ''，调用方回退到英文预设场景（中文原文绝不进生图 prompt）。
 */
async function deriveScene(zk, { title, thesis, category }) {
  const user = [
    `You are the photo editor of a business intelligence magazine. Based on the startup opportunity brief below, conceive ONE cover photograph scene.`,
    `Rules:`,
    `1. Describe a single metaphorical still-life object (a real, physical, recognizable object that symbolizes the theme) — the object ONLY, no environment, no room, no desk setting, no background scenery (the plain background is handled separately);`,
    `2. Exactly one clear subject, no second object;`,
    `3. The object must NOT be a screen, document, newspaper, book, phone, laptop, or any device that could carry text;`,
    `4. No people, no hands, no text anywhere in the scene;`,
    `5. Output ONLY 1-2 English sentences describing the scene itself. No explanation, no prefix, no quotes, no line breaks.`,
    ``,
    `Opportunity title: ${title || ''}`,
    `Thesis: ${String(thesis || '').slice(0, 200)}`,
    category ? `Category: ${String(category).replace(/-/g, ' ')}` : '',
  ].filter(Boolean).join('\n');
  // 429 拥挤常见，重试 2 次再回退英文预设场景
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ZHIPU_CHAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zk}` },
        body: JSON.stringify({
          model: GLM_MODEL,
          messages: [{ role: 'user', content: user }],
          temperature: 0.7,
          max_tokens: 120,
        }),
        signal: AbortSignal.timeout(45000),
      });
      const txt = await res.text();
      if (!res.ok) {
        if (res.status === 429 && attempt < 2) {
          console.log(`   ⚠️ 场景提炼 429，${(attempt + 1) * 20}s 后重试...`);
          await sleep((attempt + 1) * 20000);
          continue;
        }
        throw new Error(`GLM ${res.status}: ${txt.slice(0, 100)}`);
      }
      const scene = (JSON.parse(txt).choices?.[0]?.message?.content || '')
        .replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 400);
      return scene;
    } catch (e) {
      if (attempt === 2) {
        console.log(`   ⚠️ 场景提炼失败（回退预设场景）: ${e.message.slice(0, 60)}`);
        return '';
      }
      await sleep(10000);
    }
  }
  return '';
}

/**
 * 编辑静物摄影风 prompt（全英文）。
 * 负面清单尾置被 Seedream 无视过（照样画出发光大脑+电路板+赛博城市），
 * 改为前置正向约束：开头就锁死"写实摄影/真实物体/只有单一主体"，
 * 结尾只保留精简禁令。ARK 图像接口无 negative prompt 参数。
 */
export function buildCoverPrompt({ scene }) {
  return [
    `Photorealistic editorial still-life photograph, shot on 50mm lens, real physical objects only. `,
    `The frame contains ONLY one subject and empty negative space: ${scene}. `,
    `Plain off-white seamless background, matte paper-textured surface, soft natural window light, muted warm film tones, subtle film grain, shallow depth of field. One burnt-orange accent allowed. `,
    `No text, no letters, no logos, no people, no hands, no background scenery, no second object, no screens, no electronics, no illustration, no 3D render, no cartoon.`,
  ].join('');
}

/** 英文预设静物场景兜底（deriveScene 失败时用；单一物体、无环境词、绝不喂中文原文） */
function presetScene(opp) {
  const text = `${opp.title || ''} ${opp.thesis || ''}`.toLowerCase();
  if (/agent|自动化|workflow|工作流/.test(text)) {
    return 'a vintage telephone handset';
  }
  if (/成本|cost|降价|infra|基础设施/.test(text)) {
    return 'a small brass balance scale with a few coins on one pan';
  }
  if (/应用|app|构建|build|工具|tool/.test(text)) {
    return 'a single antique brass key';
  }
  return 'a brass compass';
}

/**
 * 调火山引擎 Seedream 4.5 生成一张图，返回临时 URL；失败抛错。
 * 只用 4.5，无回退模型；429 / 5xx 指数退避最多重试 2 次。
 */
async function seedreamGenerate(arkKey, prompt) {
  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(ARK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${arkKey}` },
        body: JSON.stringify({
          model: SEEDREAM_MODEL,
          prompt,
          size: '2560x1440', // 16:9，卡片 object-fit 裁切即可
          response_format: 'url',
          watermark: false,
        }),
        signal: AbortSignal.timeout(120000),
      });
      const txt = await res.text();
      if (!res.ok) {
        const err = new Error(`Seedream ${res.status}: ${txt.slice(0, 150)}`);
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      const url = JSON.parse(txt).data?.[0]?.url;
      if (!url) throw new Error('Seedream 响应无 data[0].url');
      console.log(`   🎨 Seedream 4.5 出图（${SEEDREAM_MODEL}）`);
      return url;
    } catch (e) {
      lastErr = e;
      if (e.retryable && attempt < 2) {
        const wait = 10000 * 2 ** attempt; // 10s → 20s
        console.log(`   ⚠️ Seedream 可重试错误（${e.message.slice(0, 50)}），${wait / 1000}s 后重试...`);
        await sleep(wait);
        continue;
      }
      break;
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
async function uploadToStorage(supabaseUrl, srk, filename, bytes, contentType = 'image/png') {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: {
      apikey: srk,
      Authorization: `Bearer ${srk}`,
      'Content-Type': contentType,
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

/** content-type → 文件扩展名 */
function extOf(contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('avif')) return 'avif';
  return 'jpg'; // image/jpeg 及未知一律按 jpg
}

/** 下载图片二进制，返回 { bytes, contentType } */
async function downloadImage(url) {
  const imgRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!imgRes.ok) throw new Error(`下载图片失败 HTTP ${imgRes.status}`);
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  if (bytes.length < 1024) throw new Error(`图片字节异常（${bytes.length}B）`);
  return { bytes, contentType: imgRes.headers.get('content-type') || '' };
}

function slugOf(opp) {
  return (opp.slug || opp.id || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`)
    .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60);
}

/**
 * 为一个机会生成封面并上传，返回公共 URL；失败返回 ''（绝不抛错）
 * Track 1：evidence og:image 原图转存；Track 2：Seedream 4.5 静物生成兜底。
 * @param {{ title: string, thesis?: string, category?: string, slug?: string, id?: string, evidence?: Array }} opp
 * @param {{ usedOgUrls?: Set<string>, usedHashes?: Set<string> }} [opts]
 *   usedOgUrls：本轮已被占用的 og 图 URL（URL 级去重）；
 *   usedHashes：本轮 + 线上已有封面的 sha256（内容级去重，防"不同文章共用一张素材图"）
 */
export async function generateOpportunityCover(opp, opts = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !srk) {
    console.log('   ⚠️ 缺少 Supabase 环境变量，跳过封面');
    return '';
  }
  try {
    await ensureBucket(supabaseUrl, srk);
    const name = slugOf(opp);

    // ── Track 1：evidence 网页 og:image 原图转存 ──────────────────────────
    if (Array.isArray(opp.evidence) && opp.evidence.length > 0) {
      try {
        // accept 回调里下载 + sha256 内容级去重（防"不同文章引用同一张素材图"），
        // 撞 hash 返回 false，findEvidenceImage 自动跳下一条证据
        let stashed = null;
        const ogUrl = await findEvidenceImage(opp.evidence, {
          exclude: opts.usedOgUrls,
          accept: async (url) => {
            try {
              const { bytes, contentType } = await downloadImage(url);
              const hash = sha256Hex(bytes);
              if (opts.usedHashes?.has(hash)) {
                console.log(`   ℹ️ og 图内容与本站已有封面重复（sha256 撞车），跳下一条: ${url.slice(0, 60)}`);
                return false;
              }
              stashed = { bytes, contentType, hash };
              return true;
            } catch {
              return false; // 下载失败跳下一条
            }
          },
        });
        if (ogUrl && stashed) {
          const filename = `opp-${name}-og.${extOf(stashed.contentType)}`;
          const publicUrl = await uploadToStorage(supabaseUrl, srk, filename, stashed.bytes,
            stashed.contentType.startsWith('image/') ? stashed.contentType.split(';')[0] : 'image/jpeg');
          opts.usedOgUrls?.add(ogUrl);
          opts.usedHashes?.add(stashed.hash);
          console.log(`   📷 封面走 og:image 原图转存 → ${filename}`);
          return publicUrl;
        }
        console.log('   ℹ️ 无合格 og:image 原图，落 Seedream 生成兜底');
      } catch (e) {
        console.log(`   ⚠️ og:image 转存失败（落生成兜底）: ${e.message.slice(0, 80)}`);
      }
    }

    // ── Track 2：Seedream 4.5 编辑静物摄影生成（无回退模型，失败留空）─────
    const arkKey = process.env.ARK_API_KEY;
    if (!arkKey) {
      console.log('   ⚠️ 缺少 ARK_API_KEY，无法生成封面（cover_url 留空）');
      return '';
    }
    let scene = '';
    const zk = process.env.ZHIPU_API_KEY;
    if (zk) scene = await deriveScene(zk, opp);
    if (!scene) {
      scene = presetScene(opp);
      console.log('   ℹ️ 使用预设静物场景兜底');
    }
    const prompt = buildCoverPrompt({ scene });
    const tmpUrl = await seedreamGenerate(arkKey, prompt);
    const { bytes } = await downloadImage(tmpUrl);
    const filename = `opp-${name}.png`;
    return await uploadToStorage(supabaseUrl, srk, filename, bytes, 'image/png');
  } catch (e) {
    console.log(`   ⚠️ 封面生成失败（不阻塞，cover_url 留空）: ${e.message.slice(0, 100)}`);
    return '';
  }
}
