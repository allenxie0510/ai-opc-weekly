/**
 * AI OPC · 机会封面共享库（Stage 4 / 回填脚本共用）——两级管线
 *
 * Track 1 原图优先：evidence[].source_url 网页的 og:image → 下载转存 covers 桶
 *   （真实感最强、零 AI 感；文件名 opp-<slug>-og.<ext>）
 * Track 2 生成兜底：GLM 从内容主题自行提炼视觉隐喻（英文场景）
 *   → 嵌入统一插画风格模板（2026-08-20 定稿，PHOTO 路线已下线）→ Seedream 4.5 出图
 *   → 下载字节 → 上传 covers 桶 → 公共 URL
 *   prompt 不提供任何具体元素参考，规则删减到最少、保留核心，给大模型泛化空间；
 *   GLM 彻底失败 → cover_url 留 null（宁缺毋滥，没有任何兜底图）
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
// 与 generate-opportunities.mjs 主线同一模型链：glm-4.7-flash 拥挤（429 1305）时
// 切 glm-4.5-flash 兜底（2026-08-20 根因修复：此前场景提炼无兜底，GLM 持续拥挤
// 时段封面必丢，回填也同样失败）
const GLM_MODELS = ['glm-4.7-flash', 'glm-4.5-flash'];
const BUCKET = 'covers';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Stage 4a: 用 GLM 从机会内容提炼视觉隐喻场景（英文输出）。
 * 2026-08-20 风格改版：全站封面统一为「编辑插画 · 概念隐喻风」（8 张参考图提炼
 * 的 DNA：颗粒纹理/有限配色/尺度对比/留白隐喻），**PHOTO 摄影路线已下线**，
 * 场景层不再做 PHOTO/ILLUSTRATION 二选一，统一由插画风格模板包裹。
 * 核心原则不变：LLM 从内容主题自己提炼隐喻，规则精简，给大模型泛化空间。
 * 2026-08-20 二次修订：不再硬性引导尺度对比/小人物叙事（此前执行太死，
 * 张张都有小人）——人物/静物/抽象构图自由发挥，尺度对比仅在真正契合时使用。
 * 2026-08-20 三次修订（用户亲定）：文字政策放松——不再要求主体完全 blank
 * unmarked，允许主题相关英文单词入画（须拼写正确、构图有机），绝不出现中文；
 * 含待渲染单词时要求明确措辞（with the word "AI" on...），避免描述误渲染。
 *
 * 返回场景描述 string；彻底失败返回 null
 * （调用方按宁缺毋滥原则 cover_url 留空，没有任何兜底图）。
 *
 * 根因修复记录：glm-4.7-flash 默认开启 thinking，max_tokens=120 会被 reasoning
 * 烧光导致 content 为空（finish_reason=length）。修法：thinking 显式 disabled +
 * max_tokens 提到 800 + 空内容时 log 原始响应 + 解析失败做一次裸重试。
 * 2026-08-20：GLM 调用改模型链 glm-4.7-flash → glm-4.5-flash（429 拥挤兜底）。
 */
async function deriveScene(zk, { title, thesis, category }) {
  const brief = [
    `机会标题：${title || ''}`,
    `机会论断：${String(thesis || '').slice(0, 200)}`,
    category ? `领域：${String(category).replace(/-/g, ' ')}` : '',
  ].filter(Boolean).join('\n');
  const rules = [
    `你是AI相关创业资讯网站视觉主编。根据下面的创业机会情报内容，构思一个封面视觉隐喻(生图prompt)。`,
    `规则：`,
    `从这个机会的核心主题/张力出发，构想一个封面视觉画面描述，要让人看到图能联想到这条机会的具体论点；`,
    `隐喻优先从内容的具体张力出发自由发挥：可以是人物场景，也可以是静物、抽象构图、空间关系——不要默认植入人物；仅当"个体 vs 巨大之力"的尺度对比真正契合这条机会的论点时，才使用小人物与巨大之物的对比；`,
    ``,
    `画面将以扁平编辑插画风格呈现，隐喻要让人联想到商业的高效与品质感。视觉主体表面保持干净（无蚀刻、印刷、标签、刻度等装饰性假文字）；如果有助于传递概念，画面可以出现少量与主题直接相关的英文单词（如 AI、Agent），但必须拼写正确、是构图的有机部分；绝不出现中文；`,
    `如果场景描述里包含要渲染进画面的英文单词，用明确措辞表达（如 with the word "AI" on...），避免描述性文字被误当作要渲染的内容；`,
    `只输出场景描述本身：1-2 句英文场景描述。不要任何解释、前缀、引号或换行。`,
    ``,
    brief,
  ].join('\n');
  const bare = [
    `根据下面的创业机会情报，用 1-2 句英文描述一个能隐喻其核心理念的封面画面（扁平编辑插画、极简几何构图）。视觉主体表面保持干净，不出现装饰性假文字；如有助于传递概念可出现少量拼写正确的主题相关英文单词（如 AI、Agent），绝不出现中文。只输出英文场景描述本身，不要解释。`,
    ``,
    brief,
  ].join('\n');

  // 调 GLM 一次；空内容时 log 原始响应关键字段便于诊断
  async function callOnce(prompt, label, model) {
    const res = await fetch(ZHIPU_CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zk}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
        thinking: { type: 'disabled' }, // 简单提炼任务关掉推理，否则 reasoning 烧光 max_tokens 导致 content 为空
      }),
      signal: AbortSignal.timeout(45000),
    });
    const txt = await res.text();
    if (!res.ok) {
      const err = new Error(`GLM ${res.status}(${model}): ${txt.slice(0, 100)}`);
      err.congested = res.status === 429;
      throw err;
    }
    const data = JSON.parse(txt);
    const choice = data.choices?.[0] || {};
    const content = (choice.message?.content || '')
      .replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 400);
    if (!content) {
      console.log(`   ⚠️ GLM ${label}(${model}) 返回空内容（finish=${choice.finish_reason}，usage=${JSON.stringify(data.usage || {})}，reasoning=${String(choice.message?.reasoning_content || '').slice(0, 60)}）`);
    }
    return content;
  }

  // 模型链：主模型 429 三连 → 切兜底模型重试完整流程（主流程 + 裸重试）
  for (let mi = 0; mi < GLM_MODELS.length; mi++) {
    const model = GLM_MODELS[mi];
    let congestedOut = false;

    // 主流程：带规则的调用（429 重试 2 次）
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await callOnce(rules, '场景提炼', model);
        if (out && out.length >= 10) {
          if (mi > 0) console.log(`   ℹ️ 兜底模型 ${model} 场景提炼成功`);
          return out;
        }
        // 空内容/过短：不重试同 prompt（大概率同样空），直接裸重试
        break;
      } catch (e) {
        if (e.congested && attempt < 2) {
          console.log(`   ⚠️ 场景提炼 429（${model}），${(attempt + 1) * 20}s 后重试...`);
          await sleep((attempt + 1) * 20000);
          continue;
        }
        if (attempt === 2) {
          console.log(`   ⚠️ 场景提炼请求失败: ${e.message.slice(0, 70)}`);
          congestedOut = e.congested === true;
          break; // 换下一个模型（若有）
        }
        await sleep(10000);
      }
    }
    if (congestedOut) {
      if (mi < GLM_MODELS.length - 1) console.log(`   ⏭️ ${model} 连续 429，切换兜底模型...`);
      continue;
    }

    // 裸重试：更简洁的 prompt 再试一次
    try {
      const out = await callOnce(bare, '场景提炼(裸重试)', model);
      if (out && out.length >= 10) {
        console.log(`   ℹ️ 裸重试成功（${model}）`);
        return out;
      }
    } catch (e) {
      console.log(`   ⚠️ 裸重试失败: ${e.message.slice(0, 70)}`);
      if (e.congested && mi < GLM_MODELS.length - 1) {
        console.log(`   ⏭️ ${model} 裸重试也 429，切换兜底模型...`);
        continue;
      }
      if (mi < GLM_MODELS.length - 1) continue;
    }
  }
  return null;
}

/**
 * 生成 prompt 组装：场景（deriveScene）嵌入统一风格模板。
 * 2026-08-20 四次修订（用户亲定，逐字实施；渐变落点限定为与用户确认的微调）：
 * ① 背景固定单色（Monochrome background）——上轮渐变漏到背景上，本轮收口；
 * ② 配色池只管强调色（medium-blue / off-white / soft peach / pale blue / pale green
 *   随机 1-2 个）；③ 双色渐变限定在主体元素内（within the subject elements）。
 * 不变项：颗粒点纹质感、印刷哑光、大留白、单一视觉焦点、文字政策（只禁中文/标志/水印）。
 */
export function buildCoverPrompt(scene) {
  return `Editorial-style conceptual illustration. ${scene}. Flat shapes with visible grainy stipple texture, printed-paper matte feel. a dominant color chosen to fit the scene's mood, varying across images; Monochrome background; randomly select 1-2 Accent colors(medium-blue , off-white, soft peach, pale blue or pale green), subtle two-color gradients allowed within the subject elements for depth. Generous negative space, single clear focal point. No chinese text, no logos, no watermarks anywhere in the image.`;
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
 * Track 1：evidence og:image 原图转存；Track 2：Seedream 4.5 生成兜底（PHOTO/ILLUSTRATION 两路线）。
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

    // ── Track 2：Seedream 4.5 生成（场景唯一来源 = GLM 提炼，失败留空无兜底）──
    const arkKey = process.env.ARK_API_KEY;
    if (!arkKey) {
      console.log('   ⚠️ 缺少 ARK_API_KEY，无法生成封面（cover_url 留空）');
      return '';
    }
    const zk = process.env.ZHIPU_API_KEY;
    if (!zk) {
      console.log('   ⚠️ 缺少 ZHIPU_API_KEY，无法提炼场景（cover_url 留空）');
      return '';
    }
    const scene = await deriveScene(zk, opp);
    if (!scene) {
      console.log('   ⬜ GLM 场景提炼彻底失败——宁缺毋滥，cover_url 留空（前端渐变兜底）');
      return '';
    }
    console.log(`   💡 场景隐喻（插画）: ${scene.slice(0, 80)}`);
    const prompt = buildCoverPrompt(scene);
    const tmpUrl = await seedreamGenerate(arkKey, prompt);
    const { bytes } = await downloadImage(tmpUrl);
    const filename = `opp-${name}.png`;
    return await uploadToStorage(supabaseUrl, srk, filename, bytes, 'image/png');
  } catch (e) {
    console.log(`   ⚠️ 封面生成失败（不阻塞，cover_url 留空）: ${e.message.slice(0, 100)}`);
    return '';
  }
}
