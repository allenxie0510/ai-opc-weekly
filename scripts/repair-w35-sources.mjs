/**
 * One-time, evidence-gated repair for 2026-w35.
 *
 * The original rows contained hallucinated domains, source quotes or metrics.
 * This script validates every replacement URL and exact revenue quote before
 * deleting anything, then replaces the affected rows. If insertion fails, it
 * restores the original rows.
 */
import { validateSourceUrl } from './lib/source-validation.mjs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVIDENCE_ONLY = process.env.REPAIR_EVIDENCE_ONLY === 'true';

if ((!SUPABASE_URL || !SERVICE_KEY) && !EVIDENCE_ONLY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const ISSUE_SLUG = '2026-w35';
const TARGETS = [
  {
    id: 'c60d9cb7-6015-4358-a50e-052ce5e1b8d4',
    oldTitle: 'Cohesive：AI营销文案生成器',
    productTerm: 'Cohesive',
    replacement: {
      title: 'Cohesive：面向创作者的 AI 内容工作台',
      description: 'Cohesive 是一款真实运营中的 AI 内容编辑器，官方页面显示它覆盖 SEO、广告文案、营销文案和社交媒体内容等场景，并提供 200 多个模板。它把文字编辑、AI 图片、AI 语音、资料研究和多人协作放进同一个内容工作台。官方定价页可以核对免费 Basic 层、每位编辑 25 美元月费的 Creator 层，以及每位编辑 45 美元月费的 Agency 层；不同档位按模板运行次数、图片、语音时长和集成数量区分。此前周报中关于“3 人团队、15,000 美元 MRR、3,000 家付费用户、75% 用户来自欧美”的内容没有找到对应原始证据，因此已全部删除，收入和团队规模统一标记为未披露。',
      insight: '我不建议 OPC 复刻一个大而全的通用写作平台。更可行的迁移方式，是从 Cohesive 的模板和工作流思路中拆出一个明确行业，例如跨境商品详情、房产经纪内容或本地商家促销，把资料输入、生成、审核和多格式交付做成一条窄流程。没有原始收入证据，就只把它当产品结构案例。',
      category: 'content-monetize',
      creator_level: 'medium',
      compound_potential: 'medium',
      mrr_range: '未披露',
      pricing: '免费 / $25 / $45 每位编辑',
      mvp_time: '未披露',
      refs: [
        { label: 'Cohesive 官方产品页', url: 'https://cohesive.so/' },
        { label: 'Cohesive 官方定价', url: 'https://cohesive.so/pricing/' },
      ],
      tags: ['AI内容', '模板工作流', '创作者工具'],
      rank: 3,
      section: 'deepdive',
      revenue_type: 'undisclosed',
      revenue_source_url: '',
      claim_quote: '',
    },
  },
  {
    id: '12c6a35b-c0a1-49bf-8e95-65e1788fb47b',
    oldTitle: 'AI 视频脚本生成器 ScriptGenius',
    productTerm: 'Jobric',
    replacement: {
      title: 'Jobric：候选人付费的 AI 职位匹配',
      description: 'Jobric 是 Erik Chavez 在微软全职工作之外、用个人资金开发的候选人侧 AI 职位匹配平台。用户上传简历和求职偏好后，系统从多个招聘平台筛选岗位，通过匹配评分、AI 适配分析和公司简报减少无效投递。Indie Hackers 2026 年 6 月 26 日的创始人访谈显示，Erik 于 5 月 1 日开始收费，公测用户转付费后达到 3,300 美元 MRR；他强调核心不是简单的 LLM 封装，而是职位与履历数据、确定性匹配逻辑、按需容器和自托管小模型。官网可以独立核对免费层，以及 29 美元和 49 美元两个付费月费档。这个案例的可迁移价值是从一个人的具体痛点切入，让工程规则承担确定性判断，AI 只处理语义层，再以候选人订阅保持利益一致。',
      insight: '我看好它的产品结构，不建议照抄“通用求职平台”。更适合 OPC 的做法是先选一个岗位族群或地区，只解决岗位清洗、匹配解释和定期推送。真正的壁垒是数据规范与反馈闭环，不是换一个大模型。创始人没有披露完整开发周期，因此 MVP 时间不作推测。',
      category: 'micro-saas',
      creator_level: 'medium',
      compound_potential: 'high',
      mrr_range: '$3,300/月',
      pricing: '$29 / $49 月费档',
      mvp_time: '未披露',
      refs: [
        {
          label: 'Indie Hackers 创始人访谈',
          url: 'https://www.indiehackers.com/post/tech/hitting-3-3k-mrr-in-two-months-while-working-a-full-time-job-eb5timbPqFlDFWZjha9i',
        },
        { label: 'Jobric 官方网站与定价', url: 'https://www.jobric.ai/' },
      ],
      tags: ['职位匹配', '垂直AI', '候选人订阅'],
      rank: 4,
      section: 'deepdive',
      revenue_type: 'founder_disclosed',
      revenue_source_url: 'https://www.indiehackers.com/post/tech/hitting-3-3k-mrr-in-two-months-while-working-a-full-time-job-eb5timbPqFlDFWZjha9i',
      claim_quote: "We launched on May 1, and we're already at $3,300 MRR",
    },
  },
  {
    id: 'ffca40a0-5624-4252-9f44-7e164ec6e898',
    oldTitle: 'AI 图片版权检测工具 CopyRightGuard',
    productTerm: 'Visualizee',
    replacement: {
      title: 'Visualizee.ai：把专业渲染改成对话',
      description: 'Visualizee.ai 是 Piotr Obidowski 在全职工作之外独立运营的专业 AI 渲染工具，面向建筑师、室内设计师、家具和汽车设计等具体工作流。Piotr 在 Indie Hackers 的创始人原帖中披露，早期节点式产品连续两年只有约 100 至 150 美元月收入；六个月前将复杂节点改成自然语言对话，并从一次性收费切换为订阅后，产品达到 8,600 美元 MRR。其官网仍可实际访问，并明确展示 15、35 和 80 美元月费档，以及商业许可、批量渲染等差异。这个案例的重点不是再做一个通用生图器，而是把专业用户不愿学习的提示词和节点操作隐藏到场景化工作流后面，用高意图 SEO 获取建筑与设计类用户。',
      insight: '我认为最值得复制的是“去掉提示词学习成本”，而不是渲染模型本身。OPC 可以选择橱柜、民宿、汽车改装或产品棚拍中的一个小场景，先把输入、修改和交付格式做顺。收入证据来自创始人本人原帖；官网能核对当前产品与价格，但没有可靠的原始 MVP 周期，因此不填写估算。',
      category: 'design-assets',
      creator_level: 'medium',
      compound_potential: 'high',
      mrr_range: '$8,600/月',
      pricing: '$15 / $35 / $80 月费档',
      mvp_time: '未披露',
      refs: [
        {
          label: 'Indie Hackers 创始人原帖',
          url: 'https://www.indiehackers.com/post/from-150-month-to-8-6k-mrr-how-one-pivot-and-a-lot-of-seo-saved-my-ai-startup-2af6a82ee6',
        },
        { label: 'Visualizee.ai 官方网站与定价', url: 'https://visualizee.ai/' },
      ],
      tags: ['专业渲染', '垂直工作流', 'SEO增长'],
      rank: 5,
      section: 'deepdive',
      revenue_type: 'founder_disclosed',
      revenue_source_url: 'https://www.indiehackers.com/post/from-150-month-to-8-6k-mrr-how-one-pivot-and-a-lot-of-seo-saved-my-ai-startup-2af6a82ee6',
      claim_quote: '$8.6K MRR today',
    },
  },
];

async function sb(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function verifyReplacement(target) {
  const item = target.replacement;
  for (const ref of item.refs) {
    const quote = ref.url === item.revenue_source_url ? item.claim_quote : '';
    const result = await validateSourceUrl(ref.url, {
      expectedTerms: [target.productTerm],
      quote,
      timeoutMs: 20_000,
    });
    if (!result.ok) {
      throw new Error(`Evidence rejected (${result.reason}): ${ref.url}`);
    }
    console.log(`Verified: ${ref.label} -> ${result.finalUrl}`);
  }
}

async function main() {
  // No destructive operation is allowed until all four source checks pass.
  for (const target of TARGETS) await verifyReplacement(target);
  if (EVIDENCE_ONLY) {
    console.log('All replacement evidence passed; database mutation skipped.');
    return;
  }

  const issues = await sb(`/weekly_issues?slug=eq.${ISSUE_SLUG}&select=id,slug&limit=1`);
  const issue = issues?.[0];
  if (!issue) throw new Error(`Weekly issue not found: ${ISSUE_SLUG}`);

  const idFilter = TARGETS.map(target => target.id).join(',');
  const originals = await sb(
    `/news_items?weekly_issue_id=eq.${issue.id}&id=in.(${idFilter})&select=*`,
  );
  if (originals.length !== TARGETS.length) {
    throw new Error(`Expected ${TARGETS.length} target rows, found ${originals.length}`);
  }
  for (const target of TARGETS) {
    const row = originals.find(item => item.id === target.id);
    if (!row || ![target.oldTitle, target.replacement.title].includes(row.title)) {
      throw new Error(`Safety check failed for ${target.id}: unexpected title`);
    }
  }

  const replacements = TARGETS.map(target => ({
    id: target.id,
    weekly_issue_id: issue.id,
    ...target.replacement,
  }));

  await sb(`/news_items?id=in.(${idFilter})`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });

  try {
    await sb('/news_items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(replacements),
    });
  } catch (error) {
    console.error('Replacement insert failed; restoring original rows.');
    await sb('/news_items', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(originals),
    });
    throw error;
  }

  const verified = await sb(
    `/news_items?weekly_issue_id=eq.${issue.id}&order=rank.asc&select=id,title,rank,refs,revenue_type,revenue_source_url,claim_quote`,
  );
  for (const target of TARGETS) {
    const row = verified.find(item => item.id === target.id);
    if (!row || row.title !== target.replacement.title) {
      throw new Error(`Post-write verification failed for ${target.id}`);
    }
  }

  console.log(`Repaired ${ISSUE_SLUG}:`);
  for (const row of verified) console.log(`  ${row.rank}. ${row.title}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
