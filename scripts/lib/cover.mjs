/**
 * AI OPC · 机会封面共享库（Stage 4 / 回填脚本共用）
 *
 * 流程：title + thesis + category → GLM 提炼具体视觉场景（4a）
 *   → 拼入统一风格 prompt（科技杂志扁平编辑插画风）
 *   → 智谱 CogView（cogview-3-flash）文生图（临时 URL）
 *   → 下载字节 → 上传 Supabase Storage bucket `covers`（公开）
 *   → 返回公共 URL；任何一步失败返回 ''（不阻塞主流程，前端有兜底封面）
 *
 * 环境变量：NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + ZHIPU_API_KEY
 * 前置条件：opportunities 表已有 cover_url 列
 *   alter table opportunities add column if not exists cover_url text;
 */

const COGVIEW_API = 'https://open.bigmodel.cn/api/paas/v4/images/generations';
const ZHIPU_CHAT_API = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
// 模型降级链：cogview-4（¥0.06/张，语义理解最强）→ 3-plus（¥0.1/张）→ 3-flash（免费但风格跟随差）
const MODEL_CHAIN = (process.env.COGVIEW_MODEL || 'cogview-4,cogview-3-plus,cogview-3-flash')
  .split(',').map(s => s.trim()).filter(Boolean);
const GLM_MODEL = 'glm-4.7-flash';
// 尺寸降级链：首选 1728x960（16:10），失败退 1440x810，再失败让模型用默认尺寸
const SIZE_CHAIN = ['1728x960', '1440x810', null];
const BUCKET = 'covers';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Stage 4a: 用 GLM 从机会内容提炼一个具体的视觉画面（英文场景描述）。
 * 关键：画面必须用可识别的现实物体/场景做隐喻，直接呼应主题——
 * 不要抽象几何装饰（那是上一版"跟主题没相关性"的根因）。
 * 失败返回 ''，调用方回退到原文截断。
 */
async function deriveScene(zk, { title, thesis, category }) {
  const user = [
    `你是科技杂志的插画师。请根据下面的创业机会情报，构思一个封面插画画面。`,
    `要求：`,
    `1. 用可识别的现实物体或场景做视觉隐喻，画面内容必须直接呼应主题（例如"AI 成本优化"可以画沙漏与芯片）；`,
    `2. 画面只有一个清晰的主体，构图简洁；`,
    `3. 避免以屏幕、文档、报纸、书籍、网页界面为主体（这些元素容易带出文字）；`,
    `4. 只输出 1-2 句英文场景描述本身，不要任何解释、前缀、引号或换行。`,
    ``,
    `机会标题：${title || ''}`,
    `机会论断：${String(thesis || '').slice(0, 200)}`,
    category ? `领域：${String(category).replace(/-/g, ' ')}` : '',
  ].filter(Boolean).join('\n');
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
    if (!res.ok) throw new Error(`GLM ${res.status}: ${txt.slice(0, 100)}`);
    const scene = (JSON.parse(txt).choices?.[0]?.message?.content || '')
      .replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ').slice(0, 400);
    return scene;
  } catch (e) {
    console.log(`   ⚠️ 场景提炼失败（回退原文）: ${e.message.slice(0, 60)}`);
    return '';
  }
}

/**
 * 构造统一风格的英文概念图 prompt。
 * 风格锚点（参考科技杂志编辑插画）：扁平矢量 + 柔和渐变、
 * 低饱和安静背景 + 单一醒目强调色、具体物体隐喻、一个清晰主体。
 */
export function buildCoverPrompt({ scene, category }) {
  const catHint = category ? ` Domain context: ${String(category).replace(/-/g, ' ')}.` : '';
  return [
    `Flat vector editorial spot illustration.`,
    `Scene: ${scene}.${catHint}`,
    `Style: clean flat shapes with soft subtle gradients, muted calm background (light grey, pale blue, or warm beige), one vivid accent color (amber orange or electric blue), a single clear central subject made of recognizable real-world objects, metaphorical storytelling composition, balanced layout with generous breathing space, crisp vector edges, gentle ambient light.`,
    `CRITICAL: the image must contain absolutely no text whatsoever — no letters, no words, no numbers, no typography, no headlines, no captions, no documents or screens or newspapers with writing on them, no logo, no watermark. Pure wordless visual scene only. Not photorealistic.`,
  ].join(' ');
}

/** 调 CogView 生成一张图，返回临时 URL；失败抛错 */
async function cogviewGenerate(zk, prompt) {
  let lastErr;
  let modelRejected = false;
  for (const model of MODEL_CHAIN) {
    if (modelRejected) { modelRejected = false; }
    for (let i = 0; i < SIZE_CHAIN.length; i++) {
      const size = SIZE_CHAIN[i];
      // 429 / 超时友好重试 1 次
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const body = { model, prompt, watermark: false };
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
            // 模型不存在/未开通：降级下一个模型
            if (/model|模型/i.test(txt) && (res.status === 400 || res.status === 404)) err.modelRejected = true;
            throw err;
          }
          const url = JSON.parse(txt).data?.[0]?.url;
          if (!url) throw new Error('CogView 响应无 data[0].url');
          if (model !== MODEL_CHAIN[0]) console.log(`   ℹ️ 封面使用降级模型 ${model}`);
          return url;
        } catch (e) {
          lastErr = e;
          if (e.modelRejected) {
            console.log(`   ⚠️ 模型 ${model} 不可用，降级下一个模型...`);
            modelRejected = true;
            break;
          }
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
      if (modelRejected) break;
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
    // 4a: 先从内容提炼具体视觉场景；失败回退到标题+论断原文截断
    let scene = await deriveScene(zk, opp);
    if (!scene) {
      scene = `${opp.title || ''}. ${String(opp.thesis || '').slice(0, 150)}`.trim();
    }
    const prompt = buildCoverPrompt({ scene, category: opp.category });
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
