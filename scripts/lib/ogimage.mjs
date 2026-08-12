/**
 * AI OPC · 封面 Track 1：从机会 evidence 的 source_url 网页里抓 og:image 原图
 *
 * 输入：机会的 evidence 数组（元素含 source_url）
 * 输出：通过校验的图片 URL（http(s)，真实图片、非小图标）；全部失败返回 null
 *
 * 策略：不过度工程化——反爬/超时/校验失败一律静默跳过，落到 Track 2 生成兜底。
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 已知防盗链/无意义图源域名（命中直接跳过）
const BLOCKED_DOMAINS = [
  'mmbiz.qpic.cn',       // 微信公众号图片，强防盗链
  'mmbiz.qlogo.cn',
  's.w.org',             // wordpress emoji
  'secure.gravatar.com',
  'www.gravatar.com',
];

// 路径含这些片段的多半是站点图标/头像而非内容图
// （profile_images = X/Twitter 头像目录，无媒体推文的 og:image 会回退成作者头像）
const BAD_PATH_RE = /logo|icon|favicon|avatar|emoji|profile_images/i;

// 图片级黑名单：URL 子串匹配，命中即跳过。
// 用法：发现某张 og 原图不适合当封面（AI 套路素材图、与主题无关等），
// 取其 URL 中有辨识度的子串加进来。
const BLOCKED_IMAGE_URLS = [
  // TechCrunch/Getty 蓝色人形机器人指悬浮图表的素材图——典型 AI 套路审美，且被多篇文章共用
  'GettyImages-2259148891',
];

// 图片体积下限：小于 30KB 多半是图标/装饰图
const MIN_BYTES = 30 * 1024;

const MAX_SOURCES = 4;

/** 从 HTML 里提取 og:image（优先）或 twitter:image，处理属性顺序不同的情况 */
function extractMetaImage(html) {
  const og =
    html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
  if (og?.[1]) return og[1];
  const tw =
    html.match(/<meta[^>]+(?:name|property)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image(?::src)?["']/i);
  return tw?.[1] || null;
}

/** 检查图片 URL 是否值得尝试（协议 / 域名黑名单 / 路径黑名单 / 图片级黑名单） */
function plausibleImageUrl(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (BLOCKED_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`))) return false;
  if (BAD_PATH_RE.test(u.pathname)) return false;
  if (BLOCKED_IMAGE_URLS.some(s => urlStr.includes(s))) {
    console.log(`   ℹ️ og:image 命中图片级黑名单，跳过: ${urlStr.slice(0, 60)}`);
    return false;
  }
  return true;
}

/** HEAD 校验：必须 image/* 且非 svg/gif；content-length 存在时需 > 30KB */
async function verifyImage(urlStr) {
  try {
    const res = await fetch(urlStr, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return false;
    if (ct.includes('svg') || ct.includes('gif')) return false;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > 0 && len < MIN_BYTES) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * 逐个尝试 evidence 的 source_url 页面，返回第一个合格的 og:image URL。
 * @param {Array<{ source_url?: string }>} evidence
 * @param {Set<string>|{ exclude?: Set<string>, accept?: (url: string) => Promise<boolean> }} [opts]
 *   exclude：本轮已被其他机会占用的图片 URL（URL 级去重）；
 *   accept：下载后内容级复核（如 sha256 撞车），返回 false 则继续跳下一条证据。
 *   兼容旧签名：第二参数直接传 Set 视为 exclude。
 * @returns {Promise<string|null>}
 */
export async function findEvidenceImage(evidence, opts) {
  const { exclude, accept } = opts instanceof Set ? { exclude: opts } : (opts || {});
  const sources = (Array.isArray(evidence) ? evidence : [])
    .map(e => e?.source_url)
    .filter(u => typeof u === 'string' && /^https?:\/\//.test(u))
    .slice(0, MAX_SOURCES);

  for (const pageUrl of sources) {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const raw = extractMetaImage(html);
      if (!raw) continue;
      // 相对 URL resolve 成绝对地址；处理 &amp; 转义
      let abs;
      try { abs = new URL(raw.replace(/&amp;/g, '&').trim(), res.url || pageUrl).href; }
      catch { continue; }
      if (!plausibleImageUrl(abs)) continue;
      if (exclude?.has(abs)) {
        console.log(`   ℹ️ og:image 已被本轮其他机会占用，跳下一条: ${abs.slice(0, 60)}`);
        continue;
      }
      if (!(await verifyImage(abs))) continue;
      // 内容级复核（下载 + 哈希去重等），不通过则继续跳下一条证据
      if (accept && !(await accept(abs))) continue;
      console.log(`   📷 og:image 命中: ${abs.slice(0, 80)}`);
      return abs;
    } catch {
      // 反爬/超时/解析失败：静默跳下一条
    }
  }
  return null;
}
