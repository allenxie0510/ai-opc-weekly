import type {
  AIConfig,
  BackcastPlan,
  DeepDive,
  Opportunity,
  ThemeProfile,
} from './types';
import { CRITERIA } from './criteria';
import { newId } from './scoring';
import { getToken } from './auth';

export const DEFAULT_CONFIG: AIConfig = {
  provider: 'server',
  endpoint: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-v4-flash',
};

export interface GenProgress {
  done: number;
  total: number;
  batch: Opportunity[];
}

/* ------------------------------------------------------------------ */
/* OpenAI 兼容调用                                                       */
/* ------------------------------------------------------------------ */

function extractJson(text: string): unknown {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : t;
  try {
    return JSON.parse(body);
  } catch {
    const indices = [body.indexOf('['), body.indexOf('{')].filter((i) => i >= 0);
    if (indices.length === 0) throw new Error('无法解析 AI 返回的 JSON');
    const start = Math.min(...indices);
    const open = body[start];
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < body.length; i++) {
      const ch = body[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return JSON.parse(body.slice(start, i + 1));
      }
    }
    throw new Error('无法解析 AI 返回的 JSON');
  }
}

async function callLLM(
  cfg: AIConfig,
  system: string,
  user: string,
  opts: { json?: boolean; temperature?: number } = {}
): Promise<string> {
  // 服务端代理：登录用户无需自带 Key，密钥由站长在 Vercel 环境变量中配置
  if (cfg.provider === 'server') {
    const token = await getToken();
    if (!token) throw new Error('请先登录后再使用方向探测器');
    const res = await fetch('/api/explore/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: opts.temperature ?? 0.85,
        response_format: opts.json ? { type: 'json_object' } : undefined,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || `服务端 AI 调用失败 (${res.status})`);
    }
    if (typeof data.content !== 'string' || !data.content) throw new Error('AI 返回为空');
    return data.content;
  }

  const res = await fetch(`${cfg.endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: opts.temperature ?? 0.85,
      response_format: opts.json ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI 调用失败 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content) throw new Error('AI 返回为空');
  return content;
}

function pLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    let i = 0;
    let active = 0;
    let settled = 0;
    const next = () => {
      if (settled === items.length) return resolve();
      while (active < limit && i < items.length) {
        const item = items[i++];
        active++;
        fn(item)
          .catch(reject)
          .finally(() => {
            active--;
            settled++;
            next();
          });
      }
    };
    next();
  });
}

/* ------------------------------------------------------------------ */
/* 提示词                                                               */
/* ------------------------------------------------------------------ */

const SYSTEM = `你是一位顶级商业战略顾问，精通孙正义（SoftBank 创始人）年轻时的事业选择方法：先定长远愿景，海量枚举候选事业，用系统化标准逐项打分筛选，选定方向后从目标逆向规划。

你的输出必须严格是合法 JSON，不要包含任何解释文字或 Markdown 代码块。`;

function profileToText(p: ThemeProfile): string {
  return [
    `人生/事业愿景（50 年计划）：${p.vision || '（未填写）'}`,
    `本次探索主题/方向（最高优先级范围边界）：${p.direction || '（未填写）'}`,
    `兴趣与擅长领域：${p.interests || '（未填写）'}`,
    `已掌握资源（资金/人脉/技术/渠道）：${p.resources || '（未填写）'}`,
    `硬约束（地域/时间/资金上限/不能做）：${p.constraints || '（未填写）'}`,
    `风险偏好：${p.riskTolerance}`,
    `时间跨度：${p.horizonYears} 年`,
    `个人强项：${p.strengths || '（未填写）'}`,
  ].join('\n');
}

const CROSS_INDUSTRY_PATTERN = /((跨行业|跨领域)(探索|发散|机会|应用|场景)|不限行业|不限领域|全行业|全领域|开放探索|自由发散|多行业探索|多领域探索)/i;
const NO_CROSS_INDUSTRY_PATTERN = /(不|不要|不得|禁止|严禁|避免|仅限).{0,6}(跨行业|跨领域)/i;

function crossIndustryRequested(p: ThemeProfile): boolean {
  const text = `${p.direction}\n${p.constraints}`;
  return !NO_CROSS_INDUSTRY_PATTERN.test(text) && CROSS_INDUSTRY_PATTERN.test(text);
}

function opportunityScopeRules(p: ThemeProfile): string[] {
  const direction = p.direction.trim();
  if (!direction) {
    return [
      '- 用户未明确填写探索方向：可以根据愿景、兴趣、资源和硬约束发散，但每个机会都必须与这些画像信息有直接关联。',
    ];
  }

  if (crossIndustryRequested(p)) {
    return [
      `- 用户明确要求跨行业探索；所有机会仍必须以「${direction}」为共同主线，再扩展到不同行业场景。`,
      '- 跨行业只是应用场景变化，不得丢失用户选定的共同主线。',
    ];
  }

  return [
    `- 【硬范围】只能在用户选定的「${direction}」内部生成机会。这是最高优先级约束，不是参考偏好。`,
    '- 多样性必须来自该方向内部的不同目标用户、使用场景、细分痛点、工作流、交付形态和商业模式，不得用跨到无关行业的方式凑数。',
    '- 除非用户在探索方向或硬约束中明确要求跨行业/跨领域，否则严禁引入任何方向外的行业、人群或问题。',
    '- 不得因为热门赛道、演示样本、常见案例或“覆盖更多大类”而偏离用户方向。',
    `- 每个机会的名称、一句话价值主张、目标用户和解决方案都必须能明确说明它如何属于「${direction}」。`,
    '- 如果在该范围内不易凑足数量，应继续下钻细分用户与工作流，不得放宽范围。',
  ];
}

const OPP_SCHEMA = `每个机会必须是如下 JSON 对象（数组元素）：
{
  "name": "机会名称（中文，具体、有记忆点）",
  "oneLiner": "一句话价值主张",
  "category": "所属大类",
  "targetUsers": "目标用户画像",
  "painPoint": "用户核心痛点",
  "solution": "解决方案",
  "businessModel": "商业模式与收费逻辑",
  "moat": "独创性与护城河",
  "marketNote": "市场规模与成长性判断",
  "trend": "与时代/技术浪潮（AI、数字化、出海等）的契合点",
  "capitalNeed": "低|中|高（启动与扩张所需资金）",
  "competition": "低|中|高（竞争激烈程度）",
  "timing": "早|中|晚（切入时机）",
  "scores": {"passion":1-10,"uniqueness":1-10,"no1":1-10,"market":1-10,"margin":1-10,"capital":1-10,"strengthFit":1-10,"scalability":1-10,"trend":1-10,"sustainability":1-10}
}`;

const SCORE_HINTS = CRITERIA.map((c) => `- ${c.id}: ${c.question}（${c.name}）`).join('\n');

export interface AiApi {
  generateOpportunities(
    cfg: AIConfig,
    profile: ThemeProfile,
    count: number,
    batchSize: number,
    onProgress: (p: GenProgress) => void
  ): Promise<Opportunity[]>;
  generateThemeSuggestions(cfg: AIConfig, profile: ThemeProfile): Promise<string[]>;
  deepDive(cfg: AIConfig, profile: ThemeProfile, opp: Opportunity): Promise<DeepDive>;
  buildPlan(cfg: AIConfig, profile: ThemeProfile, opp: Opportunity): Promise<BackcastPlan>;
}

/* ------------------------------------------------------------------ */
/* Mock 实现（无 API Key 也能演示）                                       */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp1to10(v: number): number {
  return Math.max(1, Math.min(10, Math.round(v)));
}

interface Seed {
  name: string;
  oneLiner: string;
  category: string;
  targetUsers: string;
  painPoint: string;
  solution: string;
  businessModel: string;
  moat: string;
  marketNote: string;
  trend: string;
  capitalNeed: Opportunity['capitalNeed'];
  competition: Opportunity['competition'];
  timing: Opportunity['timing'];
  base: Record<string, number>;
}

const T = (
  name: string,
  oneLiner: string,
  category: string,
  targetUsers: string,
  painPoint: string,
  solution: string,
  businessModel: string,
  moat: string,
  marketNote: string,
  trend: string,
  capitalNeed: Opportunity['capitalNeed'],
  competition: Opportunity['competition'],
  timing: Opportunity['timing'],
  base: Record<string, number>
): Seed => ({
  name, oneLiner, category, targetUsers, painPoint, solution,
  businessModel, moat, marketNote, trend, capitalNeed, competition, timing, base,
});

const SEEDS: Seed[] = [
  T('AI 跨境选品情报站', '用 AI 实时扫描海外社媒与平台趋势，输出可落地的选品与定价建议', '出海/跨境电商', '中小跨境电商卖家', '选品靠拍脑袋、测款成本高、错失窗口期', '聚合 TikTok/亚马逊/社媒信号，AI 生成选品与定价报告', 'SaaS 订阅 + 爆款分佣', '多源信号数据网络 + 卖家成交反馈飞轮', '跨境电商万亿级、卖家工具付费意愿强', 'AI + 数据 + 出海红利', '中', '中', '早',
    { passion: 7, uniqueness: 8, no1: 8, market: 9, margin: 8, capital: 7, strengthFit: 7, scalability: 8, trend: 9, sustainability: 8 }),
  T('银发族 AI 健康管家', '为 50+ 人群提供慢病管理与健康问答的陪伴式 AI 助手', '银发经济', '50–75 岁有慢病的中老年', '就医难、用药乱、孤独、健康知识匮乏', '语音优先的 AI 健康管家 + 家属联动 + 线下服务对接', '硬件/会员订阅 + 保险/药企合作', '适老化交互 + 家属信任 + 合规数据', '老龄化 + 慢病管理是长期大市场', 'AI + 老龄化社会趋势', '高', '中', '中',
    { passion: 8, uniqueness: 7, no1: 7, market: 9, margin: 7, capital: 5, strengthFit: 6, scalability: 7, trend: 8, sustainability: 9 }),
  T('宠物医疗 AI 预问诊', '宠物医院门口的 AI 预问诊与分诊导流工具', '宠物经济', '一二线城市宠物主、宠物医院', '宠物生病不知轻重、医院排队、过度医疗焦虑', '症状拍照 + 描述 → AI 判断紧急度并导流到合作医院', '医院 SaaS + 问诊转化佣金', '宠物医疗数据稀缺 + 医院网络', '宠物医疗年增速 15%+，支付意愿强', 'AI + 宠物消费升级', '低', '低', '早',
    { passion: 8, uniqueness: 8, no1: 8, market: 7, margin: 7, capital: 7, strengthFit: 7, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 出海法律合规助手', '面向出海企业的合同与多国合规智能审阅', 'SaaS/软件', '有出海业务的中小企业', '各国法律合规复杂、律师贵、周期长', '多语言合同审阅 + 分国别合规检查清单 + 律师兜底', '按文件/按席位订阅', '合规知识图谱 + 律师网络信任背书', '企业出海合规刚需、客单价高', 'AI 法律 + 出海合规', '中', '低', '早',
    { passion: 7, uniqueness: 8, no1: 8, market: 8, margin: 9, capital: 6, strengthFit: 7, scalability: 8, trend: 9, sustainability: 9 }),
  T('下沉市场 AI 门店经营助手', '帮街边小店做智能进销存、营销文案与经营诊断', '本地生活', '三四线城市小微门店主', '不会营销、库存乱、客流下滑、数字化门槛高', '语音记账 + AI 诊断 + 一键生成团购/短视频文案', '轻量 SaaS 订阅 + 供应链返佣', '渠道下沉 + 海量长尾门店', '本地生活数字化是万亿市场', 'AI + 下沉市场数字化', '中', '中', '中',
    { passion: 6, uniqueness: 7, no1: 6, market: 9, margin: 6, capital: 6, strengthFit: 6, scalability: 8, trend: 8, sustainability: 8 }),
  T('AI 私人知识教练', '把个人收藏与笔记变成可对话、可复习的第二大脑', '教育/知识付费', '终身学习者、备考人群、知识工作者', '信息过载、记不住、学了不会用', '导入资料 → AI 生成学习路径与每日提问复习', '订阅 + 课程导流', '个人知识库沉淀 + 学习行为数据', '知识服务付费习惯成熟', 'AI 个性化学习', '低', '中', '中',
    { passion: 7, uniqueness: 7, no1: 6, market: 7, margin: 7, capital: 7, strengthFit: 8, scalability: 7, trend: 8, sustainability: 7 }),
  T('新能源运维 AI 巡检', '用无人机 + AI 视觉做光伏/风电场的自动巡检与故障预警', '新能源/可持续', '光伏、风电运营商', '人工巡检成本高、漏检、停机损失大', 'AI 视觉识别热斑/裂纹/异物，自动生成工单', '按场站订阅 + 硬件租赁', '缺陷样本库 + 场站续约锁定', '新能源装机高速增长，运维需求同步放大', 'AI 视觉 + 双碳趋势', '高', '中', '中',
    { passion: 6, uniqueness: 8, no1: 7, market: 8, margin: 7, capital: 5, strengthFit: 6, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 短视频本地化工厂', '把中文内容一键多语种配音与本土化，批量出海分发', '内容/出海', '想做海外内容的中小团队', '语言与文化壁垒、制作成本高、分发渠道散', 'AI 翻译 + 口型对齐配音 + 本土化改编 + 多渠道分发', '按条收费 + 素材库订阅', '本土化质量 + 分发渠道整合', '全球短视频流量红利仍在', 'AI 生成 + 出海内容', '低', '中', '早',
    { passion: 7, uniqueness: 7, no1: 7, market: 8, margin: 7, capital: 8, strengthFit: 7, scalability: 8, trend: 9, sustainability: 6 }),
  T('AI 供应链对账机器人', '跨境电商与工厂之间的自动对账、差异核对与催款', '企业服务', '跨境卖家与代工厂', '订单多、账目乱、对账耗时且易出错', 'AI 解析单据、自动匹配、差异标注、生成对账单', '按交易量收费 + 年费', '单据解析准确率 + 交易数据沉淀', '供应链数字化需求明确、粘性强', 'AI 文档理解 + 数字化', '低', '低', '早',
    { passion: 6, uniqueness: 7, no1: 7, market: 7, margin: 7, capital: 8, strengthFit: 7, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 简历与面试陪练', '用 AI 模拟真实面试官，为求职者做针对性陪练与复盘', '人力资源', '应届生、转行、跳槽人群', '面试紧张、没有反馈、不知短板', '按岗位生成模拟面试 + 实时打分 + 逐题复盘', '单次付费 + 会员 + B 端校招服务', '岗位面试题库 + 反馈数据飞轮', '求职服务需求稳定、可标准化', 'AI 对话 + 就业焦虑刚需', '低', '中', '中',
    { passion: 6, uniqueness: 6, no1: 6, market: 7, margin: 6, capital: 8, strengthFit: 7, scalability: 7, trend: 8, sustainability: 7 }),
  T('AI 门店定价与库存优化', '为连锁零售做动态定价与智能补货', '零售科技', '连锁超市、便利店、餐饮', '定价靠经验、库存积压与缺货并存', 'AI 需求预测 + 动态定价 + 自动补货建议', 'SaaS 订阅 + 降损分成', '零售场景数据 + 效果可量化', '零售数字化预算充足、可复制', 'AI 预测 + 零售数字化', '中', '中', '中',
    { passion: 6, uniqueness: 7, no1: 7, market: 8, margin: 7, capital: 6, strengthFit: 6, scalability: 8, trend: 8, sustainability: 8 }),
  T('跨境 AI 客服中台', '多语种、全天候的电商客服机器人 + 人工接管', '出海/企业服务', '跨境电商品牌与独立站', '时差与语言导致响应慢、客诉流失', 'AI 理解多语种意图、自动答复与升级、沉淀 FAQ', '按会话量 + 席位订阅', '多语种模型调优 + 场景模板', '出海客服是持续性刚需', 'AI 客服 + 出海', '低', '中', '中',
    { passion: 6, uniqueness: 7, no1: 7, market: 8, margin: 8, capital: 8, strengthFit: 7, scalability: 9, trend: 9, sustainability: 8 }),
  T('银发短视频陪练社区', '教中老年做短视频、防骗、社交的轻学习社区', '银发经济', '50–70 岁想融入互联网的中老年', '被算法边缘化、怕被骗、想被关注', '大字体教学 + AI 防骗提醒 + 同龄人社区', '课程 + 会员 + 适老硬件导购', '适老化内容 + 信任社区', '银发人群触网率快速上升', 'AI + 老龄化 + 内容', '低', '低', '早',
    { passion: 7, uniqueness: 7, no1: 7, market: 8, margin: 6, capital: 8, strengthFit: 7, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 剧本杀/互动叙事引擎', '用户输入设定即可生成可玩的多分支互动剧情', '内容/游戏', '剧本杀店、互动内容创作者', '创作成本高、剧情单一、复玩率低', 'AI 生成世界观与多分支剧情、可无限重玩', 'B 端授权 + C 端会员', '生成质量 + 创作者生态', '互动娱乐内容需求增长', 'AI 生成内容', '低', '中', '早',
    { passion: 7, uniqueness: 8, no1: 7, market: 6, margin: 6, capital: 8, strengthFit: 7, scalability: 7, trend: 9, sustainability: 6 }),
  T('工厂 AI 质检一体机', '为中小制造厂提供即插即用的视觉质检设备', '工业/制造', '中小型制造工厂', '质检靠人、漏检率高、招工难', 'AI 视觉质检一体机 + 按件计费', '设备销售 + 按件/订阅', '行业缺陷样本库 + 交付轻量化', '制造业质检升级需求巨大', 'AI 视觉 + 智能制造', '高', '中', '中',
    { passion: 5, uniqueness: 7, no1: 7, market: 8, margin: 7, capital: 4, strengthFit: 5, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 儿童英语陪聊', '可语音互动的儿童英语 AI 玩伴', '教育', '3–10 岁儿童及其家长', '外教贵、开口机会少、家长不会辅导', '分级语音 AI 陪聊 + 家长学习报告', '硬件/App 订阅 + 课程包', '儿童语音模型 + 内容分级合规', '少儿英语启蒙是长红赛道', 'AI 语音 + 教育', '中', '中', '中',
    { passion: 7, uniqueness: 7, no1: 6, market: 8, margin: 7, capital: 6, strengthFit: 7, scalability: 7, trend: 8, sustainability: 8 }),
  T('跨境税务 AI 筹划', '为跨境电商与出海企业做多国税务合规与筹划', '出海/金融', '出海电商、外贸企业', '各国税务复杂、申报易出错、罚款风险高', 'AI 整理税务义务 + 合规提醒 + 专家复核', '订阅 + 按单/按国别收费', '税务知识库 + 专家背书', '出海企业税务合规是硬需求', 'AI + 出海合规', '中', '低', '中',
    { passion: 6, uniqueness: 7, no1: 7, market: 8, margin: 8, capital: 6, strengthFit: 6, scalability: 8, trend: 8, sustainability: 9 }),
  T('AI 情感陪伴日记', '能记住你、会共情的私人 AI 陪伴与情绪日记', '心理健康', '独居青年、高压白领', '孤独、情绪无人倾诉、焦虑', '长期记忆的 AI 陪伴 + 情绪追踪 + 危机转介', '会员订阅', '长期记忆与共情能力 + 情感数据', '心理健康需求爆发式增长', 'AI 陪伴 + 心理健康', '低', '中', '早',
    { passion: 7, uniqueness: 7, no1: 6, market: 8, margin: 7, capital: 8, strengthFit: 7, scalability: 8, trend: 9, sustainability: 7 }),
  T('AI 编程结对教练', '实时审查代码并讲解的编程 AI 结对伙伴', '开发者工具', '初级开发者、转码人群', '代码不会写、无人 review、踩坑多', 'IDE 插件 + AI 结对讲解与代码审查', '个人订阅 + 团队版', '工程数据 + 教学体验', '开发者工具付费习惯好、全球化天然', 'AI 编程 + 开发者', '低', '中', '中',
    { passion: 6, uniqueness: 6, no1: 5, market: 8, margin: 8, capital: 8, strengthFit: 8, scalability: 9, trend: 9, sustainability: 8 }),
  T('宠物 AI 行为解读器', '识别宠物叫声/肢体语言，翻译成情绪与需求', '宠物经济', '宠物主', '读不懂宠物情绪、担心它不舒服', 'AI 音频 + 视觉识别，输出情绪与建议', '硬件 + App 订阅', '宠物行为数据稀缺 + 情感溢价', '宠物陪伴与拟人化消费升级', 'AI 多模态 + 宠物', '中', '低', '早',
    { passion: 8, uniqueness: 9, no1: 8, market: 7, margin: 7, capital: 6, strengthFit: 7, scalability: 7, trend: 9, sustainability: 7 }),
  T('AI 直播数字人矩阵', '为商家批量生成数字人直播与带货内容', '直播电商', '中小商家、直播运营', '真人主播贵、时长有限、复制难', '数字人直播间 + AI 话术 + 多账号矩阵', '按直播时长 + 效果分成', '数字人质量 + 平台合规运营', '直播电商规模大、降本诉求强', 'AI 生成 + 直播', '中', '中', '中',
    { passion: 5, uniqueness: 6, no1: 6, market: 9, margin: 7, capital: 6, strengthFit: 6, scalability: 8, trend: 9, sustainability: 6 }),
  T('AI 医学科普内容引擎', '为医生/机构批量生成合规、可信的科普内容', '医疗内容', '医生 IP、医院、药企', '医学科普费时、有合规风险、需专业审核', 'AI 生成 + 专家审核流 + 多平台分发', '内容制作 + 合规审核服务', '医学知识库 + 审核合规流程', '健康科普流量大、B 端预算足', 'AI 内容 + 医疗合规', '低', '中', '中',
    { passion: 6, uniqueness: 6, no1: 6, market: 7, margin: 7, capital: 7, strengthFit: 6, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 二手车残值评估', '基于多源数据的二手车实时定价与车况检测', '汽车后市场', '二手车商、个人买卖', '车况不透明、定价靠经验、纠纷多', 'AI 检测 + 实时行情定价 + 报告背书', '检测服务 + 车商 SaaS', '检测数据 + 定价模型', '二手车交易量大、信息差可被数字化', 'AI 定价 + 汽车数字化', '中', '中', '中',
    { passion: 5, uniqueness: 6, no1: 6, market: 8, margin: 7, capital: 6, strengthFit: 5, scalability: 7, trend: 7, sustainability: 8 }),
  T('AI 农民植保顾问', '拍照识别病虫害并给出用药/农事建议', '农业科技', '种植户、农资经销商', '病虫害识别难、用药不当减产', '拍照识别 + AI 农事建议 + 农资对接', '订阅 + 农资电商佣金', '病虫害样本库 + 经销商网络', '农业数字化政策支持强', 'AI 视觉 + 乡村振兴', '中', '中', '中',
    { passion: 6, uniqueness: 7, no1: 7, market: 8, margin: 6, capital: 6, strengthFit: 6, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 本地餐饮评论诊断', '帮餐饮门店分析差评、提炼改进点与新品灵感', '本地生活', '中小餐饮老板', '不会看数据、差评不知怎么改、菜单老化', '聚合评论 → AI 诊断 → 可执行改进清单', '月度订阅 + 代运营', '点评数据 + 餐饮 Know-how', '餐饮数字化渗透率仍低、付费意愿上升', 'AI 分析 + 本地生活', '低', '中', '中',
    { passion: 6, uniqueness: 6, no1: 6, market: 7, margin: 6, capital: 8, strengthFit: 6, scalability: 7, trend: 8, sustainability: 8 }),
  T('跨境物流 AI 拼箱调度', '帮中小外贸做智能拼箱与物流比价', '出海/物流', '中小外贸与跨境卖家', '物流贵、拼箱难、比价耗时', 'AI 撮合拼箱 + 实时比价 + 异常预警', '撮合佣金 + 物流 SaaS', '运力数据 + 撮合网络', '跨境物流是出海基础设施刚需', 'AI 调度 + 出海', '中', '中', '中',
    { passion: 5, uniqueness: 6, no1: 6, market: 8, margin: 7, capital: 5, strengthFit: 5, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 家庭保险管家', '梳理家庭保单、识别缺口并智能推荐', '金融科技', '有保单的中产家庭', '保单多而乱、不清楚保了什么、重复投保', 'AI 保单解读 + 缺口分析 + 顾问复核', '咨询费 + 保险佣金', '保单数据 + 顾问信任', '家庭保障需求长期稳定', 'AI 文档理解 + 保险', '低', '中', '中',
    { passion: 6, uniqueness: 6, no1: 6, market: 8, margin: 7, capital: 7, strengthFit: 6, scalability: 7, trend: 7, sustainability: 8 }),
  T('AI 民宿动态定价', '为民宿房东做入住预测与动态定价', '旅游/酒店', '民宿房东、小型酒店', '淡旺季定价难、空置率高', 'AI 入住预测 + 动态调价 + 平台同步', '按房源订阅 + 增收分成', '房源数据 + 定价模型', '旅游复苏 + 民宿供给增多', 'AI 定价 + 旅游', '低', '中', '中',
    { passion: 5, uniqueness: 6, no1: 6, market: 7, margin: 7, capital: 8, strengthFit: 6, scalability: 8, trend: 7, sustainability: 7 }),
  T('AI 建筑图纸审图', '自动审查图纸中的规范冲突与错误', '建筑科技', '设计院、地产、施工方', '人工审图慢、漏项多、返工成本高', 'AI 审图 + 规范库 + 报告', '按图收费 + 订阅', '规范知识库 + 历史项目数据', '建筑业数字化升级空间大', 'AI 视觉 + 建筑数字化', '高', '中', '中',
    { passion: 5, uniqueness: 7, no1: 7, market: 7, margin: 7, capital: 4, strengthFit: 5, scalability: 6, trend: 7, sustainability: 8 }),
  T('AI 二手奢侈品鉴定', 'AI 辅助鉴定二手奢侈品真伪与成色', '二手交易', '二手奢侈品买卖双方、平台', '真假难辨、鉴定依赖专家、效率低', 'AI 图像鉴定 + 专家复核 + 溯源报告', '鉴定服务费 + 数据服务', '鉴定数据 + 专家网络', '二手奢侈品交易快速增长', 'AI 视觉 + 二手经济', '中', '中', '中',
    { passion: 5, uniqueness: 7, no1: 6, market: 7, margin: 7, capital: 6, strengthFit: 5, scalability: 7, trend: 7, sustainability: 8 }),
  T('AI 学校作业分层引擎', '按学生水平自动生成分层作业与讲解', '教育科技', '中小学教师、学校', '大班教学难因材施教、批改负担重', 'AI 分层出题 + 自动批改 + 学情报告', '学校/机构订阅', '教研内容 + 学情数据', '教育数字化是长期政策方向', 'AI 教育 + 政策支持', '中', '中', '中',
    { passion: 6, uniqueness: 6, no1: 6, market: 8, margin: 6, capital: 5, strengthFit: 6, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 私域运营助手', '帮中小商家做私域内容与个性化触达', '企业服务', '中小商家、微商、品牌', '私域运营费人力、不会做个性化', 'AI 生成朋友圈/群发/活动内容 + 客户分层', '订阅 + 按粉丝量', '客户数据 + 内容转化数据', '私域是商家长期经营阵地', 'AI 内容 + 私域', '低', '中', '中',
    { passion: 5, uniqueness: 5, no1: 5, market: 8, margin: 7, capital: 8, strengthFit: 6, scalability: 7, trend: 8, sustainability: 7 }),
  T('AI 招聘面试官助手', '帮 HR 做简历初筛、面试题生成与录用评估', '人力资源', '中小企业 HR、猎头', '简历多筛不动、面试主观、招聘周期长', 'AI 简历匹配 + 结构化面试题 + 评估报告', '订阅 + 按职位', '岗位模型 + 招聘数据', '招聘 SaaS 需求稳定', 'AI + 招聘', '低', '中', '中',
    { passion: 5, uniqueness: 5, no1: 5, market: 7, margin: 7, capital: 8, strengthFit: 6, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 碳足迹核算', '为中小企业自动核算碳排放并生成合规报告', '新能源/可持续', '出口型中小企业、制造厂', '碳合规要求增多、核算复杂、专业服务贵', 'AI 自动核算碳足迹 + 生成报告 + 减碳建议', '按报告/订阅', '核算方法学 + 数据对接', '双碳政策下合规需求刚性', 'AI 数据 + 双碳', '中', '低', '中',
    { passion: 5, uniqueness: 7, no1: 7, market: 8, margin: 7, capital: 6, strengthFit: 5, scalability: 7, trend: 8, sustainability: 8 }),
  T('AI 情感化短视频脚本', '按品牌调性批量生成高转化短视频脚本', '内容/营销', '品牌方、MCN、商家', '创意枯竭、脚本量产难、转化不稳定', 'AI 生成脚本 + 爆款结构 + 数据反馈优化', '订阅 + 定制服务', '爆款结构数据 + 品牌知识库', '短视频营销预算持续增长', 'AI 内容 + 营销', '低', '中', '中',
    { passion: 6, uniqueness: 5, no1: 5, market: 8, margin: 7, capital: 8, strengthFit: 6, scalability: 8, trend: 9, sustainability: 6 }),
  T('AI 户外运动风险预警', '为越野/登山者做路线风险与天气 AI 预警', '运动健康', '户外运动爱好者、赛事方', '户外突发风险难预判、救援难', '路线 + 天气 + 身体数据 → AI 风险预警', 'App 订阅 + 赛事服务', '路线数据 + 安全信任', '户外运动人群增长、安全刚需', 'AI 预测 + 户外', '低', '低', '中',
    { passion: 7, uniqueness: 7, no1: 7, market: 6, margin: 6, capital: 7, strengthFit: 7, scalability: 7, trend: 7, sustainability: 8 }),
  T('AI 小微金融风控', '为民间借贷/供应链金融做轻量风控评分', '金融科技', '小贷机构、供应链平台', '小微数据缺失、风控成本高、坏账', 'AI 多源数据风控评分 + 反欺诈', '按查询/订阅', '风控模型 + 数据源', '普惠金融需求长期存在', 'AI 风控 + 金融', '中', '中', '中',
    { passion: 5, uniqueness: 6, no1: 6, market: 8, margin: 8, capital: 5, strengthFit: 5, scalability: 7, trend: 7, sustainability: 8 }),
  T('AI 店铺直播复盘', '自动复盘直播数据并生成改进动作', '直播电商', '直播团队、达人', '直播复盘耗时、只看数据不会改', 'AI 拆解直播回放 → 转化归因 → 动作清单', '订阅 + 代运营', '直播数据 + 复盘方法', '直播运营精细化需求上升', 'AI 分析 + 直播', '低', '中', '中',
    { passion: 5, uniqueness: 6, no1: 6, market: 7, margin: 7, capital: 8, strengthFit: 6, scalability: 7, trend: 8, sustainability: 7 }),
  T('AI 出海品牌本土化', '为出海品牌做命名、文案与文化的本地化适配', '出海/品牌', '出海消费品牌', '本地化踩雷、文案生硬、文化冲突', 'AI 本地化 + 本土顾问复核 + 舆情监测', '项目制 + 订阅', '本土顾问网络 + 文化知识库', '品牌出海从卖货转向品牌化', 'AI + 品牌出海', '低', '中', '中',
    { passion: 6, uniqueness: 6, no1: 6, market: 8, margin: 7, capital: 7, strengthFit: 6, scalability: 8, trend: 9, sustainability: 8 }),
  T('AI 保险理赔反欺诈', '为险企做理赔材料审核与反欺诈', '金融科技', '保险公司', '理赔人工审核慢、欺诈损失大', 'AI 材料审核 + 异常检测 + 人工复核', '按件 + 订阅', '欺诈样本库 + 精算数据', '保险理赔降本增效刚需', 'AI 审核 + 保险', '中', '中', '中',
    { passion: 5, uniqueness: 6, no1: 6, market: 8, margin: 8, capital: 5, strengthFit: 5, scalability: 7, trend: 7, sustainability: 8 }),
];

const CATEGORY_TAIL: Record<string, string[]> = {
  '出海/跨境电商': ['· 日本市场版', '· 拉美市场版', '· 中东市场版', '· 东南亚版'],
  '银发经济': ['· 社区互助版', '· 高端康养版', '· 农村下沉版'],
  '宠物经济': ['· 猫向专版', '· 异宠向专版'],
  '教育/知识付费': ['· 银发再教育版', '· 职业教育版'],
  '本地生活': ['· 县域版', '· 高校周边版'],
  '新能源/可持续': ['· 工商业储能版', '· 家庭储能版'],
  'SaaS/软件': ['· 出海多语言版', '· 行业垂直版'],
  '内容/出海': ['· 短剧版', '· 知识科普版'],
  '金融科技': ['· 跨境支付版', '· 信用修复版'],
};

const SCOPED_MOCK_VARIANTS = [
  { name: '个人工作台', users: '该方向的独立从业者与一人公司', pain: '工具分散、重复操作多，难以形成稳定工作流', solution: '把核心任务组合成可复用的 AI 工作流与个人工作台', model: '个人订阅 + 高级模板包' },
  { name: '小团队协作中枢', users: '该方向的 2–10 人小团队', pain: '需求、产出与反馈分散，协作与版本管理成本高', solution: '将需求、协作、审核和交付集中到一条智能流程', model: '团队席位订阅' },
  { name: '模板与资产市场', users: '该方向的专业创作者、服务商与需求方', pain: '高质量方法与资产难沉淀、难复用、难交易', solution: '让创作者发布模板、工作流和数字资产，平台负责匹配与交付', model: '交易佣金 + 会员订阅' },
  { name: '智能审查助手', users: '该方向中需要稳定质量与一致性的团队', pain: '质量检查依赖人工经验，标准不一且返工频繁', solution: '用 AI 根据自定义标准自动审查、标注问题并给出修改建议', model: '按用量计费 + 团队版' },
  { name: '需求到交付自动化', users: '该方向的专业服务提供者', pain: '客户需求不清、沟通轮次多，从需求到交付周期过长', solution: '自动结构化需求、生成初稿、收集反馈并推进交付', model: '项目订阅 + 交付量计费' },
  { name: '垂直顾问 Copilot', users: '该方向中缺少专业方法的中小客户', pain: '专业顾问价格高、交付慢，小客户难以获得持续支持', solution: '把专家方法沉淀为可对话、可执行、可复盘的垂直 AI 顾问', model: '月度订阅 + 人工顾问升级' },
  { name: '供需撮合平台', users: '该方向的需求方与专业服务方', pain: '供需信息不对称，匹配、询价和交付质量难保障', solution: '用 AI 理解需求和能力，完成匹配、报价、交付验收与评价闭环', model: '交易佣金 + 服务方会员' },
  { name: '数据洞察看板', users: '该方向的经营者和决策者', pain: '业务数据分散，无法快速判断哪些动作真正有效', solution: '聚合关键信号，自动归因并给出下一步可执行建议', model: '数据源订阅 + 高级分析' },
  { name: '客户自助配置器', users: '需要个性化交付的该方向客户', pain: '个性化需求多，人工售前沟通与报价成本高', solution: '让客户通过引导式对话自助定义需求，即时生成方案与报价', model: '按线索量 + 成交增值费' },
  { name: '开放能力 API', users: '希望将该方向能力集成到自有产品的开发者与平台', pain: '底层能力重复建设，专业数据和工作流接入成本高', solution: '将该方向的核心模型、规则和工作流封装为可组合 API', model: '按调用量计费' },
];

function scopedMockSeed(direction: string, index: number): Seed {
  const variant = SCOPED_MOCK_VARIANTS[index % SCOPED_MOCK_VARIANTS.length];
  const round = Math.floor(index / SCOPED_MOCK_VARIANTS.length) + 1;
  const suffix = round > 1 ? ` · 细分版 ${round}` : '';
  return T(
    `${direction} · ${variant.name}${suffix}`,
    `在「${direction}」范围内，${variant.solution}`,
    direction,
    variant.users,
    variant.pain,
    `${direction}：${variant.solution}`,
    variant.model,
    `「${direction}」的垂直数据、模板、工作流与用户反馈飞轮`,
    `从「${direction}」中的细分用户和高频任务切入，先验证付费再扩展`,
    `AI 与「${direction}」专业工作流融合`,
    '低',
    '中',
    '早',
    { passion: 7, uniqueness: 7, no1: 7, market: 7, margin: 8, capital: 8, strengthFit: 7, scalability: 8, trend: 8, sustainability: 7 }
  );
}

function seedToOpp(seed: Seed, rng: () => number, profile: ThemeProfile): Opportunity {
  const scores: Record<string, number> = {};
  for (const c of CRITERIA) {
    const base = seed.base[c.id] ?? 6;
    const jitter = Math.floor(rng() * 3) - 1; // -1..1
    let v = base + jitter;
    // 个人强项维度略微向人类强项倾斜（仅演示）
    if (c.id === 'strengthFit' && profile.strengths.trim().length > 2) {
      v += Math.floor(rng() * 2) - 0;
    }
    scores[c.id] = clamp1to10(v);
  }
  return {
    id: newId(),
    name: seed.name,
    oneLiner: seed.oneLiner,
    category: seed.category,
    targetUsers: seed.targetUsers,
    painPoint: seed.painPoint,
    solution: seed.solution,
    businessModel: seed.businessModel,
    moat: seed.moat,
    marketNote: seed.marketNote,
    trend: seed.trend,
    capitalNeed: seed.capitalNeed,
    competition: seed.competition,
    timing: seed.timing,
    scores,
    overrides: {},
    status: 'pool',
    source: 'mock',
    createdAt: Date.now(),
  };
}

/** 依据名称判断一条历史数据是否来自演示样本（用于回填旧数据来源） */
export function isMockName(name: string): boolean {
  return SEEDS.some((s) => name === s.name || name.startsWith(s.name + '·'));
}

function makeVariant(seed: Seed, tail: string): Seed {
  return {
    ...seed,
    name: seed.name + tail,
    oneLiner: seed.oneLiner,
    trend: seed.trend,
    base: { ...seed.base },
  };
}

async function mockGenerate(
  profile: ThemeProfile,
  count: number,
  onProgress: (p: GenProgress) => void
): Promise<Opportunity[]> {
  const scope = profile.direction.trim() || profile.interests.trim();
  const scoped = Boolean(scope) && !crossIndustryRequested(profile);
  const rng = mulberry32((profile.vision + profile.direction + profile.interests).length * 7919 + count);
  const out: Opportunity[] = [];
  const total = Math.max(1, count);
  const batch = Math.min(12, total);
  // 打乱种子顺序
  const shuffled = [...SEEDS].sort(() => rng() - 0.5);
  let seedCursor = 0;
  for (let i = 0; i < total; i++) {
    let seed: Seed;
    if (scoped) {
      seed = scopedMockSeed(scope, i);
    } else if (seedCursor < shuffled.length) {
      seed = shuffled[seedCursor++];
    } else {
      // 超量时做变体，保证「海量」效果
      const base = shuffled[i % shuffled.length];
      const tails = CATEGORY_TAIL[base.category] ?? ['· 场景扩展版'];
      seed = makeVariant(base, tails[Math.floor(rng() * tails.length)]);
    }
    out.push(seedToOpp(seed, rng, profile));
    if ((i + 1) % batch === 0 || i === total - 1) {
      onProgress({ done: i + 1, total, batch: out.slice(-batch) });
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  return out;
}

async function mockThemeSuggestions(profile: ThemeProfile): Promise<string[]> {
  const base = ['AI + 出海合规与本地化', '银发经济 × 数字陪伴', '下沉市场数字化', '跨境内容与品牌'];
  if (profile.interests.trim().length > 1) {
    base.unshift(`${profile.interests.trim()} × AI 增效`);
  }
  return base.slice(0, 6);
}

function mockDeepDive(opp: Opportunity): DeepDive {
  return {
    thesis: `${opp.name}——用 AI 解决「${opp.painPoint}」，以 ${opp.businessModel} 变现。`,
    strengths: [`切中痛点：${opp.painPoint}`, `商业模式清晰：${opp.businessModel}`, `护城河：${opp.moat}`],
    risks: ['先发者尚未被验证，需小步试错', '获客成本可能高于预期', '需警惕平台规则或政策变化'],
    verdict: '推荐',
    verdictReason: '符合孙正义「大市场 + 独创 + 时代趋势」的核心标准，值得进入短名单进一步验证。',
  };
}

function mockPlan(opp: Opportunity, horizon: number): BackcastPlan {
  const M = (t: string, g: string, kr: string[], r: string, a: string, k: string) => ({
    timeLabel: t, goal: g, keyResults: kr, resources: r, assumptions: a, risks: k,
  });
  const yrs = Math.max(2, horizon);
  const milestones = [
    M(`${yrs}年后`, `成为「${opp.category}」细分赛道第一，建立行业标准`, [`市场份额第一`, `年度经常性收入达标`, `品牌即品类`], `资本 + 顶级人才 + 生态伙伴`, `市场需求持续放大`, `巨头入场与替代方案`),
    M(`${Math.round(yrs * 0.5)}年后`, `跑通规模化增长与壁垒，成为品类头部`, [`规模化复制、单位经济为正`, `建立数据/网络护城河`, `进入第二增长曲线`], `增长团队 + 数据中台`, `可规模化、可防御`, `扩张过快失焦`),
    M(`${Math.round(yrs * 0.3)}年后`, `实现可盈利的商业模式，进入快速放量`, [`毛利率转正、复购稳定`, `标准化交付/产品`, `种子用户口碑`], `产品 + 销售 + 交付`, `付费意愿与留存`, `现金流断裂`),
    M('1年后', `完成 PMF 验证，跑通最小闭环`, [`找到 100 个付费种子用户`, `关键指标达标（留存/复购）`, `清晰的价值主张`], `小团队 + 种子资金`, `真实痛点与付费意愿`, `伪需求`),
    M('100天后', `上线可用的 MVP 并获得首批真实反馈`, [`MVP 上线`, `深度访谈 30 个目标用户`, `验证 1 个核心假设`], `自筹 + 极简开发`, `核心假设成立`, `资源不足`),
    M('30天后', `完成方向验证与最小原型`, [`竞品与用户调研`, `画出业务蓝图`, `招募合伙人/顾问`], `时间 + 少量资金`, `方向真实可行`, `调研偏差`),
  ];
  return {
    ideaId: opp.id,
    finalVision: `${yrs}年后，让「${opp.name}」成为「${opp.category}」领域公认的第一名，改变千万用户的生活方式。`,
    successMetric: '细分赛道市占率第一 + 可持续的正向现金流',
    milestones,
    firstStep: `本周：围绕「${opp.painPoint}」访谈 5 位真实用户，验证痛点与付费意愿，并写下一页纸的商业模式。`,
  };
}

/* ------------------------------------------------------------------ */
/* OpenAI 实现                                                          */
/* ------------------------------------------------------------------ */

async function openaiGenerate(
  cfg: AIConfig,
  profile: ThemeProfile,
  count: number,
  batchSize: number,
  onProgress: (p: GenProgress) => void
): Promise<Opportunity[]> {
  const out: Opportunity[] = [];
  const batches: number[] = [];
  for (let i = 0; i < count; i += batchSize) batches.push(Math.min(batchSize, count - i));
  let done = 0;
  await pLimit(batches, 3, async (n) => {
    const user = [
      '你正在帮助创业者复现孙正义年轻时代的方法：先海量枚举候选事业，再系统筛选。',
      '请根据下面这位创业者的画像，生成【各不相同、具体可落地】的商业机会。',
      '要求：',
      ...opportunityScopeRules(profile),
      '- 每个机会都要有真实痛点、清晰商业模式与护城河，而不是空泛概念。',
      `- 为每个机会的 10 个维度打 1–10 分（要客观、有区分度，不要都打 8 分）。`,
      `- 严格输出 JSON 数组，共 ${n} 个元素。`,
      '',
      '创业者画像：',
      profileToText(profile),
      '',
      '评分维度说明：',
      SCORE_HINTS,
      '',
      OPP_SCHEMA,
    ].join('\n');
    const content = await callLLM(cfg, SYSTEM, user, { json: true, temperature: 0.65 });
    const parsed = extractJson(content);
    const arr = Array.isArray(parsed) ? parsed : [];
    const mapped: Opportunity[] = arr.slice(0, n).map((raw: any) => {
      const scores: Record<string, number> = {};
      for (const c of CRITERIA) {
        scores[c.id] = clamp1to10(Number(raw?.scores?.[c.id]) || 5);
      }
      return {
        id: newId(),
        name: String(raw?.name || '未命名机会').trim(),
        oneLiner: String(raw?.oneLiner || ''),
        category: String(raw?.category || '其他'),
        targetUsers: String(raw?.targetUsers || ''),
        painPoint: String(raw?.painPoint || ''),
        solution: String(raw?.solution || ''),
        businessModel: String(raw?.businessModel || ''),
        moat: String(raw?.moat || ''),
        marketNote: String(raw?.marketNote || ''),
        trend: String(raw?.trend || ''),
        capitalNeed: ['低', '中', '高'].includes(raw?.capitalNeed) ? raw.capitalNeed : '中',
        competition: ['低', '中', '高'].includes(raw?.competition) ? raw.competition : '中',
        timing: ['早', '中', '晚'].includes(raw?.timing) ? raw.timing : '中',
        scores,
        overrides: {},
        status: 'pool' as const,
        source: 'ai',
        createdAt: Date.now(),
      };
    });
    out.push(...mapped);
    done += n;
    onProgress({ done: Math.min(done, count), total: count, batch: mapped });
  });
  return out;
}

async function openaiThemeSuggestions(cfg: AIConfig, profile: ThemeProfile): Promise<string[]> {
  const user = [
    '根据下面的创业者画像，给出 5–6 个值得探索的「主题/方向」（每个一句话，具体而非空泛）。',
    '主题应是 AI 时代有结构性机会的方向，并与画像契合。严格输出 JSON 数组字符串。',
    '',
    profileToText(profile),
  ].join('\n');
  const content = await callLLM(cfg, SYSTEM, user, { json: true, temperature: 0.9 });
  const parsed = extractJson(content);
  if (Array.isArray(parsed)) return parsed.map(String).slice(0, 6);
  return [];
}

async function openaiDeepDive(
  cfg: AIConfig,
  profile: ThemeProfile,
  opp: Opportunity
): Promise<DeepDive> {
  const user = [
    '对下面的商业机会做一次「孙正义式」深度研判。',
    '输出 JSON：{"thesis":一句话论点, "strengths":[3条优势], "risks":[3条风险], "verdict":"强烈推荐|推荐|谨慎|不推荐", "verdictReason":"一句话理由"}',
    '',
    '创业者画像：',
    profileToText(profile),
    '',
    '机会：',
    JSON.stringify(opp, null, 2),
  ].join('\n');
  const content = await callLLM(cfg, SYSTEM, user, { json: true, temperature: 0.7 });
  const parsed = extractJson(content) as Record<string, unknown>;
  return {
    thesis: String(parsed?.thesis || ''),
    strengths: Array.isArray(parsed?.strengths) ? parsed.strengths.map(String) : [],
    risks: Array.isArray(parsed?.risks) ? parsed.risks.map(String) : [],
    verdict: (['强烈推荐', '推荐', '谨慎', '不推荐'] as const).includes(
      parsed?.verdict as any
    )
      ? (parsed!.verdict as DeepDive['verdict'])
      : '推荐',
    verdictReason: String(parsed?.verdictReason || ''),
  };
}

async function openaiPlan(
  cfg: AIConfig,
  profile: ThemeProfile,
  opp: Opportunity
): Promise<BackcastPlan> {
  const horizon = Math.max(2, profile.horizonYears || 10);
  const user = [
    `为下面的商业机会做一次「逆向规划（backcasting）」：从 ${horizon} 年后的终局目标倒推回现在。`,
    '这是孙正义的「トップダウン（自上而下）」式思考：先定终点，再倒推每个阶段该做什么。',
    '里程碑请【从远到近】排列，依次为：终局/远景、约一半时间、约三分之一时间、1 年、100 天、30 天。',
    '每个里程碑包含：goal（目标）、keyResults（2–3 个关键结果）、resources（所需资源）、assumptions（待验证假设）、risks（风险）。',
    '另给出 finalVision（终局愿景一句话）、successMetric（成功度量）、firstStep（本周第一步，具体可执行）。',
    '严格输出如下 JSON（不要代码块）：',
    '{"finalVision":"...","successMetric":"...","milestones":[{"timeLabel":"10年后","goal":"...","keyResults":["..."],"resources":"...","assumptions":"...","risks":"..."}],"firstStep":"..."}',
    '',
    '创业者画像：',
    profileToText(profile),
    '',
    '选定机会：',
    JSON.stringify(opp, null, 2),
  ].join('\n');
  const content = await callLLM(cfg, SYSTEM, user, { json: true, temperature: 0.8 });
  const parsed = extractJson(content) as Record<string, unknown>;
  const milestones = (Array.isArray(parsed?.milestones) ? parsed.milestones : []).map((m: any) => ({
    timeLabel: String(m?.timeLabel || ''),
    goal: String(m?.goal || ''),
    keyResults: Array.isArray(m?.keyResults) ? m.keyResults.map(String) : [],
    resources: String(m?.resources || ''),
    assumptions: String(m?.assumptions || ''),
    risks: String(m?.risks || ''),
  }));
  return {
    ideaId: opp.id,
    finalVision: String(parsed?.finalVision || ''),
    successMetric: String(parsed?.successMetric || ''),
    milestones,
    firstStep: String(parsed?.firstStep || ''),
  };
}

/* ------------------------------------------------------------------ */
/* 统一入口                                                             */
/* ------------------------------------------------------------------ */

export function isMock(cfg: AIConfig): boolean {
  return cfg.provider === 'mock';
}

export const ai: AiApi = {
  async generateOpportunities(cfg, profile, count, batchSize, onProgress) {
    if (isMock(cfg)) return mockGenerate(profile, count, onProgress);
    return openaiGenerate(cfg, profile, count, batchSize, onProgress);
  },
  async generateThemeSuggestions(cfg, profile) {
    if (isMock(cfg)) return mockThemeSuggestions(profile);
    return openaiThemeSuggestions(cfg, profile);
  },
  async deepDive(cfg, profile, opp) {
    if (isMock(cfg)) return mockDeepDive(opp);
    return openaiDeepDive(cfg, profile, opp);
  },
  async buildPlan(cfg, profile, opp) {
    if (isMock(cfg)) return mockPlan(opp, profile.horizonYears);
    return openaiPlan(cfg, profile, opp);
  },
};
