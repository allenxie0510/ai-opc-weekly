/**
 * W28 周报数据写入脚本
 * 
 * 用法:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbG... node scripts/insert-w28.mjs
 */

const SUPABASE_URL = 'https://lamkpavsvuhqhkknkaxc.supabase.co';

let SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getKey() {
  if (SERVICE_ROLE_KEY) return SERVICE_ROLE_KEY;
  if (process.argv.includes('--stdin')) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    SERVICE_ROLE_KEY = Buffer.concat(chunks).toString().trim();
    return SERVICE_ROLE_KEY;
  }
  console.error('❌ 请设置 SUPABASE_SERVICE_ROLE_KEY 环境变量或使用 --stdin');
  process.exit(1);
}

const newsItems = [
  // ═══ micro-saas (2条) ═══
  {
    title: "StackShip — AI 选型决策 SaaS",
    description: "StackShip 定位为独立开发者和创业团队的技术栈选型决策工具。用户输入项目类型、预算和技术偏好，AI 基于 2026 年真实开发者数据和社区评价，推荐最优的技术栈组合（前端框架、后端服务、数据库、部署平台），并给出各方案的成本估算、维护难度和扩展性评分。2026 年 AI 开发工具爆炸式增长，独立开发者在 50+ 框架和 100+ SaaS 服务之间的选型成本急剧上升。StackShip 解决了「工具太多不知道怎么选」的痛点，为早期创业者节省数周的技术调研时间。",
    insight: "先做 Web 版 MVP，聚焦 5 个最常见项目类型（全栈 SaaS、移动应用、静态网站、API 服务、电商平台），基于公开数据和社区排名构建推荐算法。在 Indie Hackers 和 Reddit r/SaaS 社区冷启动，提供免费选型报告作为引流钩子，高级功能按月订阅。",
    category: "micro-saas",
    creator_level: "medium",
    compound_potential: "high",
    mrr_range: "$1K-3K",
    pricing: "$15-49/月",
    mvp_time: "2-3周",
    refs: [
      { label: "TLDL Indie Hacker SaaS Stack 2026", url: "https://www.tldl.io/resources/indie-hacker-saas-stack-2026" },
      { label: "IdeaProof Micro SaaS Ideas 2026", url: "https://ideaproof.io/lists/micro-saas-ideas" },
      { label: "RethinkLab $0 to $10K MRR", url: "https://rethinklab.co/blog/from-0-to-10k-mrr-a-2026-indie-hacker-playbook" }
    ],
    tags: ["技术选型", "开发者工具", "SaaS创业"],
    rank: 1
  },
  {
    title: "ChurnGuard — AI 客户流失预警工具",
    description: "ChurnGuard 是一个专为 Micro SaaS 和订阅制产品设计的 AI 客户流失预警系统。通过分析用户行为数据（登录频率、功能使用深度、支持工单情绪、支付失败记录等），AI 提前 7-14 天预测可能流失的用户，并自动推荐个性化的挽留策略。2026 年 Micro SaaS 产品数量激增，用户切换成本极低，客户留存成为独立开发者面临的最大挑战之一。ChurnGuard 将企业级客户成功管理的核心能力打包为轻量级 SaaS，让个人开发者也能用数据驱动的方式降低流失率。",
    insight: "先以 Stripe + Segment 集成作为切入，对接 10 个早期 Micro SaaS 用户，免费使用 3 个月换取数据和案例。用 AI 分析流失模式，提炼出 5 类标准挽留策略模板。产品成熟后定位为 Micro SaaS 的「留存即服务」（Retention-as-a-Service）。",
    category: "micro-saas",
    creator_level: "high",
    compound_potential: "high",
    mrr_range: "$2K-6K",
    pricing: "$49-199/月",
    mvp_time: "1-2月",
    refs: [
      { label: "RethinkLab Indie Hacker Playbook", url: "https://rethinklab.co/blog/from-0-to-10k-mrr-a-2026-indie-hacker-playbook" },
      { label: "ShareUHack Indie Maker Budget", url: "https://www.shareuhack.com/en/posts/indie-maker-ai-tool-stack-budget-guide-2026" },
      { label: "Indie Hackers Avoid AI Burn", url: "https://www.indiehackers.com/post/how-to-build-a-saas-in-2026-without-getting-burned-by-ai-tools-or-agencies-97168d00ba" }
    ],
    tags: ["客户留存", "流失预警", "订阅经济"],
    rank: 2
  },

  // ═══ design-assets (2条) ═══
  {
    title: "PODVault — P.O.D. 卖家 AI 设计套件",
    description: "PODVault 面向 Print-On-Demand 卖家的 AI 设计资产管理与生成平台。用户可以直接搜索数百万 P.O.D. 已售商品的趋势数据，AI 根据热门品类（T恤、卫衣、手机壳、帆布袋等）自动生成符合市场需求的原创设计。平台内置设计合规检查，避免版权纠纷——这是 2026 年 P.O.D. 卖家面临的核心风险。同时提供 A/B 测试功能，帮助卖家在 Etsy、Amazon Merch、Redbubble 等平台测试不同设计版本的市场反应。2026 年全球 P.O.D. 市场规模突破 300 亿美元，AI 设计工具正在重塑这个行业的创作流程。",
    insight: "先用 Midjourney + DALL·E 批量生成 100 个 P.O.D. 设计样本作为冷启动内容库，在 P.O.D. 卖家 Facebook 群组和 YouTube 频道免费分发 10 个设计吸引种子用户。产品形态从设计资产库起步，逐步加入趋势分析和合规检查实现差异化。",
    category: "design-assets",
    creator_level: "low",
    compound_potential: "medium",
    mrr_range: "$500-2K",
    pricing: "$19-59/月",
    mvp_time: "2-3周",
    refs: [
      { label: "Skup P.O.D. AI Design Tools 2026", url: "https://skup.net/blog/best-ai-design-tools" },
      { label: "Krumzi AI Design Tools 2026", url: "https://www.krumzi.com/blog/best-ai-design-tools-in-2026-12-picks-for-stunning-visuals-without-design-skills" },
      { label: "Figma AI Design Tools", url: "https://www.figma.com/resource-library/ai-design-tools" }
    ],
    tags: ["P.O.D.", "按需打印", "AI设计"],
    rank: 3
  },
  {
    title: "CompoAI — UI 组件智能配色引擎",
    description: "CompoAI 是一个专注于 UI 组件配色方案的 AI 设计引擎，解决 2026 年前端开发和设计师在界面设计中的色彩决策痛点。用户输入品牌色或情绪关键词，AI 自动生成符合 WCAG 无障碍标准的完整色彩系统，包括主色、辅助色、中性色、语义色（成功/警告/错误/信息）以及深色模式适配。引擎基于 2026 年最新设计趋势训练，自动应用玻璃拟态、新野蛮主义、有机曲线等当下流行风格，生成可直接导入 Figma 或 Tailwind CSS 的色彩配置文件。为缺乏专业设计背景的独立开发者提供了即用型的设计系统。",
    insight: "先做 Figma 插件切入设计师工作流，免费提供基础配色方案，付费解锁高级风格和品牌定制。在 Dribbble 和 Behance 展示使用效果吸引设计社区关注，同步开发 Tailwind/Shadcn 的代码导出功能覆盖开发者群体。两个用户群互为增长引擎。",
    category: "design-assets",
    creator_level: "medium",
    compound_potential: "medium",
    mrr_range: "$500-2K",
    pricing: "$12-29/月",
    mvp_time: "2-3周",
    refs: [
      { label: "Humbldesign AI Replace Designers 2026", url: "https://humbldesign.io/blog-posts/will-ai-replace-designers-2026" },
      { label: "Guideflow Best AI Design Tools", url: "https://www.guideflow.com/blog/ai-design-tools" },
      { label: "Krumzi Design Tools Tested", url: "https://www.krumzi.com/blog/best-ai-design-tools-in-2026-12-picks-for-stunning-visuals-without-design-skills" }
    ],
    tags: ["UI设计", "色彩系统", "Figma插件"],
    rank: 4
  },

  // ═══ automation (2条) ═══
  {
    title: "CitizenFlow — 公民开发者 AI 工作台",
    description: "CitizenFlow 面向企业内部非技术员工（即「公民开发者」）的 AI 自动化工作台。用户可以通过自然语言描述业务流程——例如「当销售邮件中提到合同金额超过 10 万时，自动创建审批流程并通知财务总监」——AI 自动将其转化为可执行的工作流。平台预置了 200+ 企业级场景模板（采购审批、客户 onboarding、HR 入职流程、客服工单路由等），支持与主流企业软件（Salesforce、Slack、飞书、钉钉、Notion）的原生集成。2026 年公民开发者概念全面落地，企业 IT 部门开始将非关键业务的自动化需求下放到业务部门，市场空间巨大。",
    insight: "先做一个垂直场景（如客服工单智能路由）深入打磨，与 3-5 家中型企业 IT 部门合作试点，用免费 PoC 换取企业级需求反馈。产品从「业务部门自助自动化」切入，区别于传统 RPA 需要 IT 部门介入的模式，核心卖点是「5分钟学会、30分钟上线」。",
    category: "automation",
    creator_level: "high",
    compound_potential: "high",
    mrr_range: "$5K-20K",
    pricing: "$299-999/月（企业版）",
    mvp_time: "2-3月",
    refs: [
      { label: "Glean No-Code Automation 2026", url: "https://www.glean.com/blog/top-5-no-code-automation-tools" },
      { label: "WeWeb No-Code Guide 2026", url: "https://www.weweb.io/blog/no-code-automation-guide-tools-workflows-ai" },
      { label: "Anly Citizen Developers 2026", url: "https://www.anly.ai/post/future-of-no-code-automation-trends-2026" }
    ],
    tags: ["公民开发者", "企业自动化", "无代码"],
    rank: 5
  },
  {
    title: "AutoNiche — 利基市场 AI 自动化模板库",
    description: "AutoNiche 是一个面向特定行业和职业的 AI 自动化模板市场。与通用自动化工具不同，该平台专注于提供高度针对性的一键部署自动化方案——例如「房产经纪 AI 自动化包」包含自动回复客户咨询、房源信息采集、预约看房协调和合同提醒；「独立教师 AI 自动化包」包含课程排期、学员跟进、作业批改提醒和收入统计。用户选择行业模板后，连接自己的工具账户即可在 10 分钟内完成自动化部署。平台采用模板市场模式，允许自动化专家上传自己构建的行业模板并赚取佣金。",
    insight: "先从 3 个行业切入（房产经纪、教育培训、电商运营），每个行业做 5 个深度自动化模板。基于 n8n 开源引擎构建，用 Notion 落地页 + SEO 长尾关键词获客。模板创作者分成模式吸引行业专家贡献模板，构建双边市场，类似「WordPress 插件生态」的自动化版本。",
    category: "automation",
    creator_level: "medium",
    compound_potential: "high",
    mrr_range: "$2K-8K",
    pricing: "$19-79/月",
    mvp_time: "1-2月",
    refs: [
      { label: "Vellum No-Code AI Workflow Tools", url: "https://www.vellum.ai/blog/no-code-ai-workflow-automation-tools-guide" },
      { label: "Gend No-Code + AI Agents 2026", url: "https://www.gend.co/blog/top-no-code-tools-2026-enhance-with-ai-agents" },
      { label: "PrometAI Solopreneur Tech Stack", url: "https://prometai.app/blog/solopreneur-tech-stack-2026" }
    ],
    tags: ["行业模板", "自动化市场", "双边市场"],
    rank: 6
  },

  // ═══ content-monetize (2条) ═══
  {
    title: "FacelessForge — 不出镜 AI 内容工厂",
    description: "FacelessForge 为想要进入内容创作领域但不愿出镜的创作者提供全套 AI 驱动的内容制作和变现方案。平台整合了 AI 脚本生成、AI 配音（200+ 语音角色）、AI 画面生成（实拍素材匹配 + 动画生成）、自动字幕和一键发布到 YouTube/抖音/TikTok 的功能。2026 年「不出镜创作者」（Faceless Creator）群体爆发式增长，众多创作者通过 AI 辅助实现了从 $2K/月到 $10K/月的收入跃升。该平台将整个创作流程工业化——创作者只需提供话题方向，AI 自动完成从选题到发布的完整链路。",
    insight: "聚焦 3 个最热门的 Faceless 品类（科技解说、历史故事、商业案例分析），为每个品类预置 50 个脚本模板。先做 YouTube Shorts + TikTok 双平台发布工具，用免费层级吸引 1000 个创作者，付费版提供独家 AI 配音和高级画面风格。在 TikTok 上展示用自己平台做的视频来引流——产品即内容。",
    category: "content-monetize",
    creator_level: "medium",
    compound_potential: "high",
    mrr_range: "$3K-10K",
    pricing: "$29-99/月",
    mvp_time: "3-4周",
    refs: [
      { label: "Ceflix Faceless Creators Monetize", url: "https://ceflix.org/videos/watch/1890050/ai-income-strategies:-how-faceless-content-creators-monetize-ai-in-2026" },
      { label: "NeuraPlus Monetize AI Content", url: "https://neuraplus-ai.github.io/blog/how-to-monetize-ai-content-2026.html" },
      { label: "AI Thinker Lab Content Creators", url: "https://aithinkerlab.com/ai-for-content-creators-2026-what-works-whats-banned" }
    ],
    tags: ["不出镜创作", "内容工厂", "AI视频"],
    rank: 7
  },
  {
    title: "DeepDigest — AI 深度报告自动生成器",
    description: "DeepDigest 帮助独立分析师和知识创作者将碎片化信息转化为可销售的深度行业报告。用户输入研究主题和时间范围，AI 自动抓取全球新闻源、学术论文、财报、社交媒体讨论和专利数据库，进行多维交叉分析后生成结构化的研究报告——包括关键数据可视化、竞争格局图谱、趋势时间线和投资洞察。2026 年信息过载问题前所未有的严重，企业和投资者愿意为经过 AI 提炼的高质量行业洞察付费。该工具尤其适合金融分析师、行业研究员和咨询服务从业者将专业知识规模化变现。",
    insight: "先选一个高价值垂直领域（如 AI 芯片行业或东南亚电商），用产品自己生成 5 份免费报告作为内容营销，在 LinkedIn 和 Substack 分发引流，同时展示产品能力的上限。核心用户是独立分析师和咨询顾问，定价按报告数量而非时间，与用户的变现模式对齐。",
    category: "content-monetize",
    creator_level: "medium",
    compound_potential: "medium",
    mrr_range: "$1K-5K",
    pricing: "$49-199/月",
    mvp_time: "1-2月",
    refs: [
      { label: "NewZenler AI for Creators 2026", url: "https://www.newzenler.com/blog/ai-for-creators-ultimate-guide" },
      { label: "Pickaxe Monetize AI Agents", url: "https://pickaxe.co/post/monetize-ai-agents-2026" },
      { label: "NeuraPlus AI Content Monetization", url: "https://neuraplus-ai.github.io/blog/how-to-monetize-ai-content-2026.html" }
    ],
    tags: ["深度报告", "知识付费", "AI研究"],
    rank: 8
  },

  // ═══ indie-tool (2条) ═══
  {
    title: "DevPulse — 独立开发者健康度监测",
    description: "DevPulse 是一个专为独立开发者设计的项目和业务健康度监测仪表板。不同于面向大型团队的项目管理工具，该平台专注于个人开发者的需求：实时追踪 MRR 变化趋势、客户流失预警、代码提交活跃度、产品关键指标（DAU/MAU、转化率）和社交媒体提及量。AI 自动分析各指标之间的关联，在指标异常时通过 Slack/Telegram/微信推送预警。平台上集成了 2026 年 200+ 成功独立产品的基准数据，帮助开发者将自己的产品表现与同类产品对标。独立开发者常年在孤立环境中工作，缺少外部视角，该工具提供了数据驱动的决策依据。",
    insight: "依托 Stripe、GitHub、Google Analytics、Twitter API 构建数据聚合层，先做 10 个核心指标的面板 MVP。在 Indie Hackers 和 Twitter #buildinpublic 社区提供 6 个月免费试用换取产品反馈和口碑。差异化在于「个人视角」而非团队视角——所有数据展示和预警逻辑都针对单人决策优化。",
    category: "indie-tool",
    creator_level: "high",
    compound_potential: "high",
    mrr_range: "$2K-6K",
    pricing: "$19-79/月",
    mvp_time: "1-2月",
    refs: [
      { label: "ShareUHack Indie Maker Guide", url: "https://www.shareuhack.com/en/posts/indie-maker-ai-tool-stack-budget-guide-2026" },
      { label: "RethinkLab $0-$10K MRR", url: "https://rethinklab.co/blog/from-0-to-10k-mrr-a-2026-indie-hacker-playbook" },
      { label: "Watashi Games AI Dev Tools", url: "https://watashigames.com/blog/ai-tools-indie-developers-2026" }
    ],
    tags: ["独立开发者", "数据分析", "业务健康"],
    rank: 9
  },
  {
    title: "ArtisanHub — AI 手工艺创作者电商工具",
    description: "ArtisanHub 是一个面向手工艺创作者和独立设计师的 AI 电商运营工具。平台帮助创作者将手工产品的制作过程自动转化为营销内容——AI 从制作视频中提取关键画面、生成产品故事文案、自动生成多语言商品描述、创建 Pinterest/Etsy/小红书适配的商品卡片。同时集成 AI 定价助手，基于同类产品市场数据推荐最优定价策略。2026 年全球手工艺电商市场持续增长，Etsy 活跃卖家超过 1000 万，手工艺创作者普遍面临「会做产品但不会卖」的困境，AI 电商运营工具成为刚需。",
    insight: "选 Etsy + Pinterest + 小红书三个平台切入，做一套「产品上线三件套」工具：从一张产品照片自动生成三个平台的完整商品信息。先用手工艺创作者 Facebook 群组和 YouTube 教程视频获客，免费提供 3 个产品的上线服务，付费解锁无限额度。产品核心在于降低创作者的营销技能门槛。",
    category: "indie-tool",
    creator_level: "medium",
    compound_potential: "medium",
    mrr_range: "$1K-3K",
    pricing: "$15-49/月",
    mvp_time: "3-4周",
    refs: [
      { label: "CommercePundit AI Business Ideas", url: "https://www.commercepundit.com/blog/22-ai-business-ideas-that-are-quietly-making-people-rich-in-2026" },
      { label: "Kittl Profitable Digital Products", url: "https://www.kittl.com/blogs/digital-products-to-sell-dsi" },
      { label: "AI SuperHub Best Digital Products", url: "https://www.aisuperhub.io/blog/15plus-best-digital-products-to-sell-in-2026-the-practical-guide" }
    ],
    tags: ["电商运营", "手工艺", "内容营销"],
    rank: 10
  },

  // ═══ digital-product (2条) ═══
  {
    title: "CourseForge AI — AI 课程自动打包工具",
    description: "CourseForge AI 帮助领域专家将专业知识一键转化为完整的在线课程产品。用户只需提供核心知识大纲或一系列文章/视频素材，AI 自动完成课程结构设计、逐课脚本撰写、幻灯片生成、配套练习题创建、课后作业设计，并导出为可上传到 Teachable、Udemy、Notion 等平台的课程包。2026 年全球在线教育市场规模接近 4000 亿美元，越来越多行业专家希望通过在线课程将知识变现，但课程制作是最大的卡点。AI 将课程制作时间从数月压缩到数天，让更多专家能够进入知识付费市场。",
    insight: "选 5 个热门课程方向（AI 工具使用、个人理财、数字营销、编程入门、设计基础）预置课程框架，专家只需填入领域内容。与 3-5 个领域 KOL 合作，免费为其生成课程并分润，换取推广案例和社交证明。产品形态从「课程打包工具」做起，长期向「知识资产化管理平台」演进。",
    category: "digital-product",
    creator_level: "medium",
    compound_potential: "high",
    mrr_range: "$2K-6K",
    pricing: "$39-149/月",
    mvp_time: "1-2月",
    refs: [
      { label: "CommercePundit AI Business Ideas", url: "https://www.commercepundit.com/blog/22-ai-business-ideas-that-are-quietly-making-people-rich-in-2026" },
      { label: "Taskade One-Person Companies", url: "https://www.taskade.com/blog/one-person-companies" },
      { label: "AI SuperHub Digital Products Guide", url: "https://www.aisuperhub.io/blog/15plus-best-digital-products-to-sell-in-2026-the-practical-guide" }
    ],
    tags: ["在线课程", "知识变现", "AI教育"],
    rank: 11
  },
  {
    title: "CalcKit AI — 智能计算器数字产品平台",
    description: "CalcKit AI 帮助专业人士将行业计算公式和评估模型转化为可销售的交互式计算工具。例如财务顾问可以创建「退休规划计算器」、健身教练可以创建「TDEE 与宏量营养素计算器」、房地产经纪人可以创建「购房成本综合计算器」。用户输入自己的专业公式和业务逻辑，AI 自动生成带品牌定制的交互式网页计算器，支持嵌入客户自己的网站、Notion 页面或作为独立链接分享。嵌入后自动收集潜在客户信息，同时作为销售线索生成工具。2026 年交互式工具类数字产品是增长最快的品类之一，相比静态模板具有更高的用户粘性和转化率。",
    insight: "先做 10 个高需求品类的计算器模板（财务、健身、房产、SaaS定价），做成 Notion 风格的简约设计。在 Gumroad 和 Product Hunt 上架，每个模板定价 $15-39。建立「计算器模板市场」后逐步向定制化工具平台转型，让用户无需代码即可自定义和发布自己的计算器。",
    category: "digital-product",
    creator_level: "low",
    compound_potential: "medium",
    mrr_range: "$500-2K",
    pricing: "$15-39/个",
    mvp_time: "1-2周",
    refs: [
      { label: "Kittl Best Digital Products 2026", url: "https://www.kittl.com/blogs/digital-products-to-sell-dsi" },
      { label: "PrometAI Solopreneur Tech Stack", url: "https://prometai.app/blog/solopreneur-tech-stack-2026" },
      { label: "G-Co Digital Product Agencies", url: "https://www.g-co.agency/insights/top-digital-product-agencies-to-work-with" }
    ],
    tags: ["交互工具", "计算器", "数字产品"],
    rank: 12
  }
];

async function main() {
  const key = await getKey();

  console.log('🔄 开始写入 W28 周报数据...');
  console.log(`📋 共 ${newsItems.length} 条内容`);
  console.log(`🔑 使用 service_role key (${key.substring(0, 20)}...)\n`);

  // 1. Check if W28 already exists
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/weekly_issues?slug=eq.2026-w28&select=id,slug`,
    {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      }
    }
  );
  const existing = await checkRes.json();
  let issueId;

  if (existing && existing.length > 0) {
    issueId = existing[0].id;
    console.log(`⚠️  W28 已存在 (id: ${issueId})，将覆盖 news_items\n`);
    // Delete existing news_items
    await fetch(
      `${SUPABASE_URL}/rest/v1/news_items?weekly_issue_id=eq.${issueId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        }
      }
    );
    console.log('🗑️  已清除旧 news_items\n');
  } else {
    // Create weekly_issue
    const issueRes = await fetch(
      `${SUPABASE_URL}/rest/v1/weekly_issues`,
      {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          slug: '2026-w28',
          issue_number: 28,
          year: 2026,
          week_number: 28,
          week_start: '2026-07-06',
          week_end: '2026-07-12',
          title: 'AI OPC Weekly #28',
          summary: '本期聚焦Micro SaaS零成本启动、P.O.D. AI设计套件、公民开发者自动化平台、不出镜内容创作工厂、独立开发者数据监测等12个新兴创业方向',
          cover_image: '',
          status: 'published',
          published_at: new Date().toISOString()
        })
      }
    );

    if (!issueRes.ok) {
      const errBody = await issueRes.text();
      console.error(`❌ 创建 weekly_issue 失败 (${issueRes.status}):`, errBody);
      process.exit(1);
    }
    const issueData = await issueRes.json();
    issueId = issueData[0].id;
    console.log(`✅ 创建 weekly_issue (id: ${issueId})\n`);
  }

  // 2. Insert news_items
  const itemsToInsert = newsItems.map(item => ({
    ...item,
    weekly_issue_id: issueId,
  }));

  const insertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/news_items`,
    {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(itemsToInsert)
    }
  );

  if (!insertRes.ok) {
    const errBody = await insertRes.text();
    console.error(`❌ 插入 news_items 失败 (${insertRes.status}):`, errBody);
    process.exit(1);
  }

  const inserted = await insertRes.json();
  console.log(`✅ 成功写入 ${inserted.length} 条 news_items\n`);

  // 3. Verify
  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/news_items?weekly_issue_id=eq.${issueId}&order=rank.asc&select=id,title,category,rank`,
    {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      }
    }
  );

  if (!verifyRes.ok) {
    console.error('❌ 验证查询失败');
    process.exit(1);
  }

  const verify = await verifyRes.json();
  console.log('📊 验证结果:');
  const cats = new Map();
  for (const item of verify) {
    const c = item.category;
    cats.set(c, (cats.get(c) || 0) + 1);
    console.log(`  #${item.rank} [${item.category}] ${item.title}`);
  }
  console.log(`\n📈 分类分布:`);
  for (const [cat, count] of cats) {
    console.log(`  ${cat}: ${count} 条`);
  }

  console.log(`\n🎉 W28 周报数据写入完成!`);
  console.log(`🌐 查看: https://www.aiopcnews.com/weekly/2026-w28`);
}

main().catch(console.error);
