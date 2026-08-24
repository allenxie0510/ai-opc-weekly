import type {
  ConfidenceInput,
  EvidenceGrade,
  ProductOpportunity,
  ProductRadarRunSummary,
  RiskItem,
  RiskLevel,
  ScoreDimensions,
  SupplyOffer,
} from './domain';
import { calculateConfidenceScore, calculateOpportunityScore, classifyDecision, classifyOpportunityStage, type StageSignals } from './scoring';

interface FixtureDefinition {
  slug: string;
  title: string;
  category: string;
  shortDescription: string;
  stageSignals: StageSignals;
  dimensions: ScoreDimensions;
  riskPenalty: number;
  confidence: ConfidenceInput;
  evidenceGrade: EvidenceGrade;
  riskLevel: RiskLevel;
  whyNow: string;
  signals: Array<{ metric: string; value: number | string; note: string }>;
  contentReasons: string[];
  contentAngles: string[];
  supply?: Array<{ title: string; unitPrice: number; moq: number; dropship: boolean; shipping: number; attributes: string[] }>;
  risks?: RiskItem[];
  retailPrice: number;
  testPlan?: { budget: string; duration: string; steps: string[]; successThreshold: string; killCondition: string };
  staleHours?: number;
  missingTrend?: boolean;
  missingImage?: boolean;
  limitations?: string[];
}

const STAGES: Record<'emerging' | 'accelerating' | 'breakout' | 'crowded' | 'declining', StageSignals> = {
  emerging: { trend7dGrowth: 12, trend30dGrowth: 16, acceleration: 4, demandStrength: 52, competitionDensity: 34 },
  accelerating: { trend7dGrowth: 32, trend30dGrowth: 26, acceleration: 12, demandStrength: 68, competitionDensity: 48 },
  breakout: { trend7dGrowth: 47, trend30dGrowth: 41, acceleration: 22, demandStrength: 88, competitionDensity: 61 },
  crowded: { trend7dGrowth: 18, trend30dGrowth: 34, acceleration: 5, demandStrength: 82, competitionDensity: 87 },
  declining: { trend7dGrowth: -14, trend30dGrowth: -9, acceleration: -5, demandStrength: 43, competitionDensity: 67 },
};

const DEFAULT_TEST_PLAN = {
  budget: '¥300–600',
  duration: '3天',
  steps: ['先从供应商购买 1–2 件样品完成实拍', '用 3 个不同内容角度发布小范围测试', '只在有收藏、私信或加购信号后小批量补货'],
  successThreshold: '3 条内容累计获得 ≥15 次有效收藏或 ≥5 次购买咨询',
  killCondition: '3 天没有任何有效咨询，或样品实测无法支撑卖点',
};

const definitions: FixtureDefinition[] = [
  {
    slug: 'magnetic-travel-cable-organizer', title: '磁吸旅行数据线收纳片', category: '数码收纳', shortDescription: '把凌乱数据线变成可视化的整理前后对比，小体积、易寄送。',
    stageSignals: STAGES.accelerating, dimensions: { momentum: 89, contentability: 91, competitionGap: 75, supplyFit: 88, margin: 82, timing: 86 }, riskPenalty: 5,
    confidence: { completeness: 90, freshness: 94, providerReliability: 86, crossSourceAgreement: 82 }, evidenceGrade: 'A', riskLevel: 'low',
    whyNow: '近期“通勤包减负”和“数码 EDC”内容同时增温，而磁吸结构天然适合做 3 秒前后对比。',
    signals: [{ metric: '7d_normalized_interest', value: 84, note: '经归一化的 7 日内容兴趣指数上行' }, { metric: 'content_pattern', value: '收纳前后对比', note: '高频可复制的内容结构' }, { metric: 'supply_match', value: 5, note: '找到 5 个支持一件代发的 Fixture 供应样本' }],
    contentReasons: ['前后对比强，不需要复杂脚本', '数据线凌乱是可视化痛点', '通勤、旅行、办公桌三个场景可复用'],
    contentAngles: ['3 秒把包里的线全部定位', '出差只带这一片收纳', '整理师不会告诉你的线材收纳'],
    supply: [{ title: '磁吸硅胶理线收纳片', unitPrice: 8.6, moq: 1, dropship: true, shipping: 5, attributes: ['一件代发', '中性包装'] }, { title: '旅行便携理线器', unitPrice: 7.9, moq: 2, dropship: true, shipping: 5, attributes: ['支持混色'] }],
    retailPrice: 39.9,
  },
  {
    slug: 'clip-on-desk-light', title: '夹式桌面柔光补光灯', category: '内容创作', shortDescription: '给小空间创作者的低成本桌面补光方案。',
    stageSignals: STAGES.breakout, dimensions: { momentum: 94, contentability: 93, competitionGap: 68, supplyFit: 85, margin: 76, timing: 92 }, riskPenalty: 7,
    confidence: { completeness: 91, freshness: 96, providerReliability: 88, crossSourceAgreement: 91 }, evidenceGrade: 'A', riskLevel: 'medium',
    whyNow: '桌面口播和带货实拍增多，低价、不占地的补光设备比大型灯架更适合一人创作者。',
    signals: [{ metric: '7d_normalized_interest', value: 93, note: '经归一化的 7 日兴趣强度进入突破区间' }, { metric: 'acceleration', value: '+22%', note: '短周期兴趣加速快于 30 日基线' }, { metric: 'supply_match', value: 4, note: '支持一件发样品充足' }],
    contentReasons: ['开灯前后的画面变化强', '可拆解不同肤色、桌深和拍摄机位', '使用门槛低'], contentAngles: ['租房博主的最小补光解法', '白天与夜间实拍对比', '一人公司桌面开播布光'],
    supply: [{ title: 'USB 夹式柔光灯', unitPrice: 22, moq: 1, dropship: true, shipping: 7, attributes: ['三档色温', 'USB-C'] }],
    risks: [{ id: 'risk-light-cert', level: 'medium', title: '电器合规与发热', detail: '不同电源方案存在质量和认证差异。', mitigation: '优先选择低压 USB 供电，样品连续点亮 8 小时测试。' }], retailPrice: 89,
  },
  {
    slug: 'pet-hair-laundry-sheet', title: '洗衣机宠物浮毛吸附片', category: '居家清洁', shortDescription: '主打洗衣前后浮毛可视化对比的低客单消耗品。',
    stageSignals: STAGES.crowded, dimensions: { momentum: 76, contentability: 90, competitionGap: 32, supplyFit: 92, margin: 71, timing: 62 }, riskPenalty: 8,
    confidence: { completeness: 93, freshness: 88, providerReliability: 85, crossSourceAgreement: 86 }, evidenceGrade: 'A', riskLevel: 'medium',
    whyNow: '内容需求仍然强，但同质化已高；只适合从多猫家庭或高粘毛面料等细分场景切入。',
    signals: [{ metric: 'competition_density', value: 87, note: '竞争内容密度高' }, { metric: 'content_pattern', value: '浮毛对比', note: '素材表现稳定但重复度高' }, { metric: 'supply_match', value: 5, note: '供给充足且易于代发' }],
    contentReasons: ['效果可视化', '宠物家庭痛点频繁', '可以做面料对照'], contentAngles: ['黑衣服洗完还是毛？', '多猫家庭一周实测', '三种吸毛产品横评'],
    supply: [{ title: '可复用洗衣吸毛片', unitPrice: 1.2, moq: 10, dropship: true, shipping: 5, attributes: ['混批'] }], retailPrice: 29.9,
  },
  {
    slug: 'portable-label-printer', title: '便携无墨标签机', category: '整理工具', shortDescription: '适合手账、仓储和家庭收纳的小型热敏打印机。',
    stageSignals: STAGES.crowded, dimensions: { momentum: 72, contentability: 84, competitionGap: 28, supplyFit: 78, margin: 65, timing: 55 }, riskPenalty: 10,
    confidence: { completeness: 88, freshness: 82, providerReliability: 84, crossSourceAgreement: 80 }, evidenceGrade: 'A', riskLevel: 'high',
    whyNow: '使用场景广但市场拥挤，需要从特定模板和标签耗材复购而非单卖机器。',
    signals: [{ metric: 'competition_density', value: 91, note: '头部同类内容密集' }, { metric: 'search_intent', value: '稳定', note: '使用教程型搜索意图稳定' }, { metric: 'risk', value: '高', note: '电器质量和 App 兼容性风险' }],
    contentReasons: ['出纸过程有视觉反馈', '模板使用可持续更新', '整理前后对比明显'], contentAngles: ['一人公司的小仓库标签系统', '租房厨房低成本分类', '标签机最容易踩的三个坑'],
    supply: [{ title: '蓝牙热敏标签机', unitPrice: 48, moq: 1, dropship: true, shipping: 8, attributes: ['一件代发'] }], retailPrice: 99,
  },
  {
    slug: 'travel-compression-pouch', title: '无泵旅行压缩收纳包', category: '旅行收纳', shortDescription: '通过双层拉链压缩衣物，不依赖抽气泵。',
    stageSignals: STAGES.accelerating, dimensions: { momentum: 84, contentability: 92, competitionGap: 69, supplyFit: 80, margin: 79, timing: 84 }, riskPenalty: 5,
    confidence: { completeness: 85, freshness: 91, providerReliability: 82, crossSourceAgreement: 79 }, evidenceGrade: 'A', riskLevel: 'low',
    whyNow: '假期出行前置搜索增长，且“同一行李箱装入更多”的视觉证据容易传播。',
    signals: [{ metric: '7d_normalized_interest', value: 81, note: '短期兴趣上行' }, { metric: 'seasonality', value: '出行前置', note: '节假日前内容需求提高' }, { metric: 'supply_match', value: 3, note: '三个可小单测试供应样本' }],
    contentReasons: ['装入量对比强', '可拆分不同旅行天数', '需求与出行节点一致'], contentAngles: ['20 寸行李箱塞进 7 天衣服', '压缩包与真空袋对比', '不抽气的懒人打包法'],
    supply: [{ title: '双拉链旅行压缩包', unitPrice: 18, moq: 1, dropship: true, shipping: 6, attributes: ['一件代发', '多色'] }], retailPrice: 69,
  },
  {
    slug: 'drawer-cable-charging-box', title: '抽屉式桌面充电站', category: '数码收纳', shortDescription: '把插线板、充电头和线材收入一个桌面模块。',
    stageSignals: STAGES.emerging, dimensions: { momentum: 65, contentability: 86, competitionGap: 78, supplyFit: 52, margin: 74, timing: 69 }, riskPenalty: 9,
    confidence: { completeness: 70, freshness: 79, providerReliability: 72, crossSourceAgreement: 61 }, evidenceGrade: 'B', riskLevel: 'medium',
    whyNow: '桌面美学内容开始从“好看”转向“无线化工作流”，但供应规格尚未标准化。',
    signals: [{ metric: '30d_normalized_interest', value: 58, note: '处于早期上行区间' }, { metric: 'content_pattern', value: '桌面改造', note: '改造型内容有较好完播结构' }, { metric: 'supply_gap', value: '规格分散', note: '尺寸与电器配套不统一' }],
    contentReasons: ['整理前后对比', '多设备充电痛点具体', '桌面改造容易系列化'], contentAngles: ['桌上没有一根散线', '三台设备同时充电的收纳法', '小桌面充电站改造'], supply: [], retailPrice: 119,
    missingTrend: true,
    limitations: ['当前未找到符合一件代发和规格要求的供应样本，不建议直接上架。', '本次趋势快照缺失，页面会显示缺数据状态，不会插值造线。'],
  },
  {
    slug: 'reusable-oil-spray-bottle', title: '可计量厨房喷油瓶', category: '厨房工具', shortDescription: '为空气炸锅和轻食用户提供可视化控油。',
    stageSignals: STAGES.accelerating, dimensions: { momentum: 83, contentability: 89, competitionGap: 66, supplyFit: 86, margin: 81, timing: 80 }, riskPenalty: 6,
    confidence: { completeness: 82, freshness: 89, providerReliability: 81, crossSourceAgreement: 76 }, evidenceGrade: 'B', riskLevel: 'medium',
    whyNow: '空气炸锅和减脂餐内容中，“少油但要均匀”的操作痛点频繁出现。',
    signals: [{ metric: '7d_normalized_interest', value: 79, note: '短期话题兴趣加速' }, { metric: 'workflow_fit', value: '空气炸锅', note: '可嵌入稳定的做饭工作流' }, { metric: 'supply_match', value: 4, note: '低起订供给充足' }],
    contentReasons: ['喷雾对比可视化', '可实测单次用油量', '菜谱内容可自然带出产品'], contentAngles: ['空气炸锅一顿到底用多少油', '三种喷油瓶雾化实测', '减脂餐的控油工作流'],
    supply: [{ title: '刻度玻璃喷油瓶', unitPrice: 9.5, moq: 1, dropship: true, shipping: 6, attributes: ['一件代发', '食品接触材质说明'] }],
    risks: [{ id: 'risk-food-contact', level: 'medium', title: '食品接触材质', detail: '必须核对供应商的材质和检测文件。', mitigation: '上架前索取可核验的材质证明，并做渗漏与耐温样测。' }], retailPrice: 39.9,
  },
  {
    slug: 'mini-handheld-fan-stand', title: '可立式迷你手持风扇', category: '夏日出行', shortDescription: '可手持也可做桌面支架的轻量风扇。',
    stageSignals: STAGES.breakout, dimensions: { momentum: 96, contentability: 92, competitionGap: 80, supplyFit: 91, margin: 85, timing: 95 }, riskPenalty: 4,
    confidence: { completeness: 35, freshness: 90, providerReliability: 30, crossSourceAgreement: 20 }, evidenceGrade: 'C', riskLevel: 'high',
    whyNow: '高温节点使兴趣短期爆发，但当前仅有单一来源的归一化信号，尚不足以支撑强推荐。',
    signals: [{ metric: '7d_normalized_interest', value: 97, note: '单一 Fixture 来源显示高兴趣' }, { metric: 'freshness', value: '高', note: '信号新鲜但缺乏交叉印证' }, { metric: 'confidence', value: 49, note: '数据完整度和多源一致性不足' }],
    contentReasons: ['风力和噪音可横评', '通勤场景强', '体积对比直观'], contentAngles: ['地铁通勤风力实测', '手持与桌面两用法', '迷你风扇噪音横评'],
    supply: [{ title: '可立式手持风扇', unitPrice: 19, moq: 1, dropship: true, shipping: 6, attributes: ['USB-C'] }],
    risks: [{ id: 'risk-battery', level: 'high', title: '锂电运输与质量', detail: '内置电池产品存在运输、虚标与安全风险。', mitigation: '只选可提供电池检测文件的供应商，先完成充放电样测。' }], retailPrice: 69,
    limitations: ['这是“高机会分、低置信度”边界样本：Evidence C 使决策自动降级为保持关注。'],
  },
  {
    slug: 'shoe-cleaning-foam-kit', title: '免水洗球鞋清洁套装', category: '居家清洁', shortDescription: '用白鞋局部污渍的即时对比验证效果。',
    stageSignals: STAGES.accelerating, dimensions: { momentum: 79, contentability: 94, competitionGap: 57, supplyFit: 88, margin: 83, timing: 76 }, riskPenalty: 7,
    confidence: { completeness: 81, freshness: 87, providerReliability: 79, crossSourceAgreement: 74 }, evidenceGrade: 'B', riskLevel: 'medium',
    whyNow: '换季鞋柜整理和雨天污渍场景同时提供内容切口，效果能用一双鞋左右对照。',
    signals: [{ metric: 'content_pattern', value: '左右鞋对照', note: '强结果型内容' }, { metric: '7d_normalized_interest', value: 76, note: '换季清洁兴趣上行' }, { metric: 'supply_match', value: 5, note: '低成本供给充足' }],
    contentReasons: ['一镜到底即可证明效果', '污渍类型可系列化', '复购可能性高'], contentAngles: ['小白鞋一分钟恢复实测', '不同鞋面材质能不能用', '免水洗是真清洁还是遮盖'],
    supply: [{ title: '球鞋清洁泡沫套装', unitPrice: 6.8, moq: 1, dropship: true, shipping: 5, attributes: ['中性包装'] }], retailPrice: 29.9,
  },
  {
    slug: 'desktop-vacuum-mini', title: '桌面键盘迷你吸尘器', category: '桌面清洁', shortDescription: '针对键盘缝隙和桌面碎屑的小型清洁工具。',
    stageSignals: STAGES.emerging, dimensions: { momentum: 62, contentability: 88, competitionGap: 73, supplyFit: 74, margin: 70, timing: 66 }, riskPenalty: 6,
    confidence: { completeness: 76, freshness: 84, providerReliability: 78, crossSourceAgreement: 70 }, evidenceGrade: 'B', riskLevel: 'low',
    whyNow: '办公桌改造内容中，清洁维护是尚未被过度开发的一步。',
    signals: [{ metric: '30d_normalized_interest', value: 55, note: '早期稳定增长' }, { metric: 'competition_gap', value: 73, note: '专注工作流的内容相对较少' }, { metric: 'content_pattern', value: '碎屑吸入', note: '过程可视化' }],
    contentReasons: ['清理过程舒适解压', '可用不同碎屑做实测', '容易嵌入桌面改造主题'], contentAngles: ['键盘缝里到底有多脏', '一人公司的每周桌面复位', '三种迷你吸尘器吸力对比'],
    supply: [{ title: '充电式桌面吸尘器', unitPrice: 16, moq: 1, dropship: true, shipping: 6, attributes: ['一件代发'] }], retailPrice: 49.9,
    missingImage: true,
  },
  {
    slug: 'silicone-food-storage-bag', title: '可立式硅胶保鲜袋', category: '厨房收纳', shortDescription: '可重复使用、能直立收纳的食品袋。',
    stageSignals: STAGES.declining, dimensions: { momentum: 33, contentability: 67, competitionGap: 31, supplyFit: 82, margin: 51, timing: 28 }, riskPenalty: 12,
    confidence: { completeness: 90, freshness: 72, providerReliability: 86, crossSourceAgreement: 88 }, evidenceGrade: 'A', riskLevel: 'high',
    whyNow: '兴趣与内容互动都在回落，高置信证据指向“不要追”，更适合作为反例观察。',
    signals: [{ metric: '7d_growth', value: '-14%', note: '短期兴趣回落' }, { metric: '30d_growth', value: '-9%', note: '中期基线同步下行' }, { metric: 'competition_density', value: 67, note: '存量供给与内容仍然偏多' }],
    contentReasons: ['收纳效果可视化', '密封实验可拍摄', '但内容结构已过度重复'], contentAngles: ['硅胶袋用一年后怎么样', '密封与异味实测', '不建议购买的三种情况'],
    supply: [{ title: '可立硅胶食品保鲜袋', unitPrice: 11, moq: 2, dropship: true, shipping: 6, attributes: ['多尺寸'] }], retailPrice: 39,
    staleHours: 60,
  },
  {
    slug: 'mini-garment-steamer', title: '折叠便携挂烫机', category: '旅行电器', shortDescription: '给出差和直播穿搭用户的便携衣物整理设备。',
    stageSignals: STAGES.emerging, dimensions: { momentum: 64, contentability: 82, competitionGap: 70, supplyFit: 69, margin: 67, timing: 63 }, riskPenalty: 20,
    confidence: { completeness: 67, freshness: 78, providerReliability: 71, crossSourceAgreement: 58 }, evidenceGrade: 'B', riskLevel: 'blocked',
    whyNow: '出差穿搭的流程痛点清晰，但电器认证与蒸汽烫伤风险在未核验前构成阻断条件。',
    signals: [{ metric: '30d_normalized_interest', value: 57, note: '早期需求信号' }, { metric: 'risk_gate', value: '阻断', note: '供应商合规证据未核验' }, { metric: 'provider_failure', value: '供应详情失败', note: '供应 Provider 本次返回不完整' }],
    contentReasons: ['褶皱前后对比强', '酒店和出差场景具体', '可比较不同面料'], contentAngles: ['出差行李箱里的衣服急救', '三种面料挂烫实测', '便携挂烫机最大的安全坑'],
    supply: [], retailPrice: 159,
    risks: [{ id: 'risk-steam-cert', level: 'blocked', title: '合规证据未齐', detail: '尚无法核对必要的电器安全资料。', mitigation: '在授权供应 Provider 返回可核验证明前不进入测试。' }],
    limitations: ['这是 Provider 失败与阻断风险的 Fixture 边界样本。'],
  },
];

function ago(hours: number, now = new Date()): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

function trend(days: number, signal: StageSignals, now: Date): Array<{ date: string; normalizedInterest: number }> {
  const points: Array<{ date: string; normalizedInterest: number }> = [];
  const growth = days <= 7 ? signal.trend7dGrowth : signal.trend30dGrowth;
  const end = Math.max(12, Math.min(98, signal.demandStrength));
  const start = Math.max(8, Math.min(95, end / (1 + growth / 100)));
  for (let i = 0; i < days; i += days <= 7 ? 1 : 3) {
    const progress = days === 1 ? 1 : i / (days - 1);
    const wave = Math.sin(i * 1.7) * 2.4;
    points.push({
      date: new Date(now.getTime() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
      normalizedInterest: Math.round(Math.max(0, Math.min(100, start + (end - start) * progress + wave))),
    });
  }
  return points;
}

function supplyUrl(title: string): string {
  return `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(title)}`;
}

function buildFixture(definition: FixtureDefinition, index: number, now: Date): ProductOpportunity {
  const dataAsOf = ago(definition.staleHours ?? (3 + index), now);
  const stage = classifyOpportunityStage(definition.stageSignals);
  const score = calculateOpportunityScore(definition.dimensions, definition.riskPenalty);
  const confidence = calculateConfidenceScore(definition.confidence);
  const decision = classifyDecision(score.finalScore, confidence, definition.riskLevel, definition.evidenceGrade);
  const offers: SupplyOffer[] = (definition.supply ?? []).map((offer, offerIndex) => ({
    id: `fixture-supply-${definition.slug}-${offerIndex + 1}`,
    provider: '1688 Fixture',
    title: offer.title,
    url: supplyUrl(offer.title),
    unitPrice: offer.unitPrice,
    minOrderQuantity: offer.moq,
    onePieceDropship: offer.dropship,
    shippingEstimate: offer.shipping,
    supplierLocation: '中国大陆（Fixture）',
    attributes: offer.attributes,
    capturedAt: dataAsOf,
  }));
  const firstOffer = offers[0];
  return {
    id: `fixture-opportunity-${index + 1}`,
    slug: definition.slug,
    title: definition.title,
    category: definition.category,
    shortDescription: definition.shortDescription,
    imageUrl: definition.missingImage ? undefined : `/product-radar/${definition.slug}.svg`,
    stage,
    score,
    confidence,
    evidenceGrade: definition.evidenceGrade,
    decision,
    decisionReason: `${score.finalScore} 分机会质量，${confidence} 分证据置信度；${definition.evidenceGrade === 'C' ? 'C 级证据已自动限制强推荐。' : definition.riskLevel === 'blocked' ? '阻断风险覆盖分数结果。' : '已扣除可识别风险。'}`,
    whyNow: definition.whyNow,
    topSignals: definition.signals.slice(0, 3).map((signal, signalIndex) => ({
      id: `fixture-signal-${definition.slug}-${signalIndex + 1}`,
      provider: signal.metric === 'supply_match' || signal.metric === 'supply_gap' || signal.metric === 'provider_failure' ? '1688 Fixture' : 'XHS Trend Fixture',
      capturedAt: dataAsOf,
      metric: signal.metric,
      value: signal.value,
      note: signal.note,
    })),
    trend7d: definition.missingTrend ? [] : trend(7, definition.stageSignals, now),
    trend30d: definition.missingTrend ? [] : trend(30, definition.stageSignals, now),
    contentabilityReasons: definition.contentReasons,
    contentAngles: definition.contentAngles.slice(0, 5),
    supplyOffers: offers.slice(0, 5),
    profitDefaults: {
      retailPrice: definition.retailPrice,
      unitCost: firstOffer?.unitPrice ?? Math.round(definition.retailPrice * 0.35 * 10) / 10,
      shippingCost: firstOffer?.shippingEstimate ?? 7,
      packagingCost: 1.5,
      platformFeeRate: 5,
      returnAllowanceRate: 8,
      promotionCost: 8,
    },
    riskLevel: definition.riskLevel,
    risks: definition.risks ?? [{ id: `risk-${definition.slug}`, level: definition.riskLevel, title: '样品与实际履约差异', detail: 'Fixture 供应信息不代表实时库存、质量或售后能力。', mitigation: '必须买样、验收并和供应商确认一件代发条款。' }],
    testPlan: definition.testPlan ?? DEFAULT_TEST_PLAN,
    updatedAt: dataAsOf,
    dataAsOf,
    providers: ['XHS Trend Fixture', '1688 Fixture', 'Rule-based Score Engine'],
    dataMode: 'fixture',
    limitations: ['当前是 Fixture 演示数据，不代表小红书实时搜索量或 1688 实时库存。', ...(definition.limitations ?? [])],
  };
}

export function getFixtureOpportunities(now = new Date()): ProductOpportunity[] {
  return definitions.map((definition, index) => buildFixture(definition, index, now));
}

export function getFixtureRunSummary(now = new Date()): ProductRadarRunSummary {
  return {
    runId: `fixture-${now.toISOString().slice(0, 10)}`,
    status: 'partial',
    mode: 'fixture',
    startedAt: ago(1, now),
    finishedAt: ago(0.9, now),
    scannedSignals: 36,
    publishedOpportunities: definitions.length,
    providerStatus: [
      { provider: 'XHS Trend Fixture', status: 'fallback', message: '未连接授权小红书数据 Provider，使用演示信号。' },
      { provider: '1688 Fixture', status: 'fallback', message: '未连接正式 1688 Provider，供货链接为搜索入口。' },
      { provider: 'Rule-based Score Engine', status: 'ok', message: '机会分与置信度已用确定性代码计算。' },
    ],
  };
}
