/**
 * AI OPC · 机会封面共享库（Stage 4 / 回填脚本共用）——两级管线
 *
 * Track 1 原图优先：evidence[].source_url 网页的 og:image → 下载转存 covers 桶
 *   （真实感最强、零 AI 感；文件名 opp-<slug>-og.<ext>）
 * Track 2 生成兜底：GLM 从内容主题自行提炼视觉隐喻（英文，标注 PHOTO/ILLUSTRATION 路线）
 *   → 套对应风格模板 → Seedream 4.5 出图 → 下载字节 → 上传 covers 桶 → 公共 URL
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
const GLM_MODEL = 'glm-4.7-flash';
const BUCKET = 'covers';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Stage 4a: 用 GLM 从机会内容提炼视觉隐喻场景（英文输出 + 路线标注）。
 * 核心原则：LLM 从内容主题自己提炼隐喻，规则精简（用户定稿版 + 一条具象
 * AI 符号/文字载体禁区，发光体/全息投影明确不限制），给大模型泛化空间。
 * 输出格式：首词 `PHOTO:` 或 `ILLUSTRATION:` + 1-2 句英文场景。
 *
 * 返回 { route: 'PHOTO'|'ILLUSTRATION', scene: string }；彻底失败返回 null
 * （调用方按宁缺毋滥原则 cover_url 留空，没有任何兜底图）。
 *
 * 根因修复记录：glm-4.7-flash 默认开启 thinking，max_tokens=120 会被 reasoning
 * 烧光导致 content 为空（finish_reason=length）。修法：thinking 显式 disabled +
 * max_tokens 提到 800 + 空内容时 log 原始响应 + 解析失败做一次裸重试。
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
    ``,
    `两种视觉路线二选一，选更贴合内容的：`,
    `a. PHOTO = 偏写实摄影`,
    `b. ILLUSTRATION = 扁平商业插画：体现主题的设计元素、网格/节点/趋势线/雷达弧/仪表盘式构图、哑光配色；`,
    `隐喻要让人联想到商业的高效与品质感，视觉主体表面必须完全空白无标记（blank, unmarked）——不要蚀刻、印刷、标签、品牌字样、刻度，任何文字或类文字纹理都不能出现在画面里；`,
    `禁止具象 AI 符号和文字载体：机器人、芯片、大脑、AI 字样图标、界面、屏幕、玻璃拟态面板、蓝图、文档、报纸、书籍——这类主体要么俗套要么天然带文字；不要 AI slop（千篇一律的 AI 生成套路图）；发光体和全息投影不做限制，可以大胆使用；`,
    // 工程性补充（已向用户声明）：代码解析路线的必要依据
    `只输出场景描述本身：首词写 PHOTO: 或 ILLUSTRATION: 标注路线，然后 1-2 句英文场景描述。不要任何解释、前缀、引号或换行。`,
    ``,
    brief,
  ].join('\n');
  const bare = [
    `根据下面的创业机会情报，用 1-2 句英文描述一个能隐喻其核心理念的封面画面（写实摄影或极简几何构图均可），视觉主体表面完全空白无标记（blank, unmarked）。禁止机器人/芯片/AI字样/界面/屏幕/文字载体，不要 AI slop。只输出英文场景描述本身，不要解释。`,
    ``,
    brief,
  ].join('\n');

  // 调 GLM 一次；空内容时 log 原始响应关键字段便于诊断
  async function callOnce(prompt, label) {
    const res = await fetch(ZHIPU_CHAT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zk}` },
      body: JSON.stringify({
        model: GLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 800,
        thinking: { type: 'disabled' }, // 简单提炼任务关掉推理，否则 reasoning 烧光 max_tokens 导致 content 为空
      }),
      signal: AbortSignal.timeout(45000),
    });
    const txt = await res.text();
    if (!res.ok) {
      const err = new Error(`GLM ${res.status}: ${txt.slice(0, 100)}`);
      err.congested = res.status === 429;
      throw err;
    }
    const data = JSON.parse(txt);
    const choice = data.choices?.[0] || {};
    const content = (choice.message?.content || '')
      .replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 400);
    if (!content) {
      console.log(`   ⚠️ GLM ${label} 返回空内容（finish=${choice.finish_reason}，usage=${JSON.stringify(data.usage || {})}，reasoning=${String(choice.message?.reasoning_content || '').slice(0, 60)}）`);
    }
    return content;
  }

  // 主流程：带格式要求的调用（429 重试 2 次）→ 解析路线前缀
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await callOnce(rules, '场景提炼');
      if (out) {
        const m = out.match(/^(PHOTO|ILLUSTRATION)\s*[:：]\s*(.+)$/i);
        if (m && m[2].length >= 10) {
          return { route: m[1].toUpperCase(), scene: m[2].trim() };
        }
        console.log(`   ⚠️ 场景提炼输出无路线标注，裸重试: ${out.slice(0, 60)}`);
        break; // 有内容但格式不符 → 走裸重试
      }
      // 空内容：不重试同 prompt（大概率同样空），直接裸重试
      break;
    } catch (e) {
      if (e.congested && attempt < 2) {
        console.log(`   ⚠️ 场景提炼 429，${(attempt + 1) * 20}s 后重试...`);
        await sleep((attempt + 1) * 20000);
        continue;
      }
      if (attempt === 2) {
        console.log(`   ⚠️ 场景提炼请求失败: ${e.message.slice(0, 60)}`);
        return null;
      }
      await sleep(10000);
    }
  }

  // 裸重试：无格式要求，拿到内容后按关键词推断路线（默认 PHOTO）
  try {
    const out = await callOnce(bare, '场景提炼(裸重试)');
    if (out && out.length >= 10) {
      const route = /illustration|geometric|flat|diagram|grid/i.test(out) ? 'ILLUSTRATION' : 'PHOTO';
      console.log(`   ℹ️ 裸重试成功（推断路线 ${route}）`);
      return { route, scene: out.replace(/^(PHOTO|ILLUSTRATION)\s*[:：]\s*/i, '') };
    }
  } catch (e) {
    console.log(`   ⚠️ 裸重试失败: ${e.message.slice(0, 60)}`);
  }
  return null;
}

/**
 * 生成 prompt 组装：纯正向定义（风格框架 + deriveScene 场景），不用负向约束。
 * 共同基调：modern, minimal, premium business aesthetic——简洁、现代、高效、品质感
 * （商业编辑质感 + 数据信号感 + AI 未来感，Linear/Stripe/Every 配图气质）。
 * 中文原文绝不进生图 prompt。
 */
export function buildCoverPrompt({ route, scene }) {
  return route === 'ILLUSTRATION'
    ? `modern business illustration. ${scene}. Flat geometric shapes, clean grid, generous negative space, premium fintech-editorial quality. All surfaces are blank and unmarked.`
    : `Modern editorial photograph, premium commercial editorial quality. ${scene}. Clean seamless light-grey or off-white studio background, contemporary design objects with sleek matte or brushed finishes, subtle film grain. Color palette: warm white, light grey, deep ink, one burnt-orange accent. All surfaces are blank and unmarked.`;
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
    const derived = await deriveScene(zk, opp);
    if (!derived) {
      console.log('   ⬜ GLM 场景提炼彻底失败——宁缺毋滥，cover_url 留空（前端渐变兜底）');
      return '';
    }
    console.log(`   💡 场景隐喻（${derived.route}）: ${derived.scene.slice(0, 80)}`);
    const prompt = buildCoverPrompt(derived);
    const tmpUrl = await seedreamGenerate(arkKey, prompt);
    const { bytes } = await downloadImage(tmpUrl);
    const filename = `opp-${name}.png`;
    return await uploadToStorage(supabaseUrl, srk, filename, bytes, 'image/png');
  } catch (e) {
    console.log(`   ⚠️ 封面生成失败（不阻塞，cover_url 留空）: ${e.message.slice(0, 100)}`);
    return '';
  }
}
