import type { Criterion } from './types';

/**
 * 孙正义年轻时代的方法，把「40 项检查项目」归纳为 10 个可打分的维度。
 * 每个维度给出 1–10 分，乘以人类可调的权重（0–5）后加权求和，得到 0–100 的总分。
 */
export const CRITERIA: Criterion[] = [
  {
    id: 'passion',
    name: '终身热情',
    short: '热情',
    desc: '这件事是否让你愿意热爱并投入 50 年而不厌倦？',
    question: '创业者对这个方向的持久热情与内在驱动力有多强（能否坚持 50 年）？',
    weight: 5,
    kind: 'subjective',
    origin: '「能否让自己专注 50 年」——孙正义最看重的第一性标准',
  },
  {
    id: 'uniqueness',
    name: '独创与壁垒',
    short: '独创',
    desc: '是否属于新领域、有独创性，并具备可持续的护城河？',
    question: '该机会的独创性与竞争壁垒强度如何（是否是新领域/难被复制的护城河）？',
    weight: 4,
    kind: 'subjective',
    origin: '「是否属于尚未有人做过的独创事业」',
  },
  {
    id: 'no1',
    name: '十年夺冠潜力',
    short: '夺冠',
    desc: '10 年内是否有机会成为该细分领域的第一名？',
    question: '10 年内做到该细分赛道 No.1 的可行性与夺冠潜力如何？',
    weight: 4,
    kind: 'subjective',
    origin: '「是否能在 10 年内成为该领域的 No.1」',
  },
  {
    id: 'market',
    name: '市场规模与成长',
    short: '市场',
    desc: '目标市场是否足够大、且仍在持续增长？',
    question: '目标市场的现有规模与未来成长性如何（是否大而增长）？',
    weight: 4,
    kind: 'objective',
    origin: '「市场规模是否足够大、是否持续成长」',
  },
  {
    id: 'margin',
    name: '利润率与现金流',
    short: '利润',
    desc: '能否产生高利润率与健康的现金流？',
    question: '该商业模式的利润率水平与现金流健康度如何？',
    weight: 3,
    kind: 'objective',
    origin: '「能否产生高利润率、高附加价值」',
  },
  {
    id: 'capital',
    name: '资本效率',
    short: '资本',
    desc: '是否轻资产、低启动成本，不依赖海量资金？',
    question: '资本效率如何（启动与扩张所需资金是否低、回报是否高）？',
    weight: 3,
    kind: 'objective',
    origin: '「是否是资本效率型、不需巨额资金的事业」',
  },
  {
    id: 'strengthFit',
    name: '个人强项契合',
    short: '契合',
    desc: '是否与你本人的强项、资源、人脉高度契合？',
    question: '该机会与创业者本人的强项/资源/人脉的契合度如何？',
    weight: 5,
    kind: 'subjective',
    origin: '「能否活用自己现有的知识、技术与经验」',
  },
  {
    id: 'scalability',
    name: '全球化/规模化',
    short: '规模化',
    desc: '是否具备跨区域复制与规模化扩张的潜力？',
    question: '该业务跨区域复制与规模化扩张的潜力如何？',
    weight: 3,
    kind: 'objective',
    origin: '「能否做成全球化/可大规模复制的事业」',
  },
  {
    id: 'trend',
    name: '时代趋势契合',
    short: '趋势',
    desc: '是否踩在时代与技术浪潮的风口上（如数字化、AI）？',
    question: '与当下时代/技术浪潮（如 AI、数字化、出海）的契合度如何？',
    weight: 4,
    kind: 'objective',
    origin: '「是否顺应时代潮流」——孙正义押注「数字信息革命」',
  },
  {
    id: 'sustainability',
    name: '可持续抗过时',
    short: '可持续',
    desc: '需求与技术是否不易过时，能长期存续？',
    question: '该需求与技术被颠覆/过时的风险有多低、可持续性如何？',
    weight: 3,
    kind: 'objective',
    origin: '「是否不容易被时代淘汰、能长期存续」',
  },
];

export const CRITERION_MAP: Record<string, Criterion> = Object.fromEntries(
  CRITERIA.map((c) => [c.id, c])
);

/** 孙正义原始检查项（整理自多份资料；原文口径有 25 项 / 40 项等不同版本） */
export const SON_ORIGINAL_CHECKS: string[] = [
  '能否让我专注 50 年而依然热爱？',
  '是否属于新领域、具有独创性？',
  '是否能在 10 年内成为该领域 No.1？',
  '市场规模是否足够大、且持续成长？',
  '能否产生高利润率与健康现金流？',
  '是否是资本效率型、不需巨额启动资金？',
  '能否活用自己已有的知识、技术与经验？',
  '能否做成全球化、可大规模复制的事业？',
  '是否顺应时代/技术浪潮（当时他押注「数字信息革命」）？',
  '需求与技术是否不易过时、能长期存续？',
  '是否有清晰的商业模式与收费逻辑？',
  '能否获得他人（伙伴/客户/投资人）的认同与支持？',
  '成功时对社会的贡献是否足够大？',
  '失败时的最大损失是否可控、可承受？',
  '是否是自己真正想做的事，而不是随波逐流？',
];

export function totalWeight(criteria: Criterion[]): number {
  return criteria.reduce((s, c) => s + c.weight, 0);
}
