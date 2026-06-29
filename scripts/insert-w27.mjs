/**
 * W27 周报数据写入脚本
 * 
 * 用法1（推荐，使用 service_role key）:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJhbG... node scripts/insert-w27.mjs
 * 
 * 用法2（从 stdin 读取 key）:
 *   echo "eyJhbG..." | node scripts/insert-w27.mjs --stdin
 */

const SUPABASE_URL = 'https://lamkpavsvuhqhkknkaxc.supabase.co';

// Get service role key from env or stdin
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
  console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJhbG... node scripts/insert-w27.mjs');
  process.exit(1);
}

const newsItems = [
  // ═══ micro-saas (2条) ═══
  {
    title: "PromptIntellect — AI 微服务交易平台",
    description: "PromptIntellect 是一个面向 AI 时代的微服务交易平台，允许独立开发者将 AI 驱动的功能封装为可交易的微服务模块。平台解决了 AI 功能碎片化的问题——开发者可以将文本分析、图像生成、数据提取等 AI 能力打包成标准化的 API 服务，企业用户按需订阅。2026 年 AI 微服务市场规模快速增长，越来越多企业希望在不自建 AI 团队的情况下集成 AI 能力。该平台为独立开发者提供了一条将 AI 技能转化为可持续收入的新路径，具有低边际成本和规模效应的典型 SaaS 特征。",
    insight: "从单一场景切入（如电商产品描述生成），包装为标准 API，在 PromptIntellect 或 RapidAPI 等平台发布，按调用量定价。MVP 可在 2-3 周内完成，先验证需求再扩展功能。",
    category: "micro-saas",
    creator_level: "medium",
    compound_potential: "high",
    mrr_range: "$500-2K",
    pricing: "$9-49/月",
    mvp_time: "2-3周",
    refs: [
      { label: "Indie Hackers", url: "https://www.indiehackers.com/post/build-an-end-to-end-ai-based-micro-saas-in-a-day-2881f6f0f9" },
      { label: "TLDL SaaS Stack", url: "https://www.tldl.io/resources/indie-hacker-saas-stack-2026" },
      { label: "IdeaProof 50 Micro SaaS", url: "https://ideaproof.io/lists/micro-saas-ideas" }
    ],
    tags: ["AI微服务", "API经济", "按需付费"],
    rank: 1
  },
  {
    title: "NicheSaaS — 垂直行业 AI 工具",
    description: "面向特定垂直行业的轻量级 AI SaaS 工具正在成为 2026 年独立开发者的热门方向。与泛化的 AI 工具不同，垂直行业工具专注于解决某一特定领域的痛点——例如专为牙科诊所设计的 AI 预约管理和患者沟通系统、面向小型律所的 AI 合同审查助手、针对独立书店的 AI 库存推荐引擎。这类产品的竞争壁垒来自行业 know-how 而非技术复杂度。2026 年数据显示，垂直 SaaS 的用户留存率比通用工具高出 40%，获客成本更低，且客户生命周期价值显著更高。",
    insight: "选择一个熟悉的垂直行业，找到 3-5 个从业者深度访谈，确定最高频的痛点，用 Bolt 或 Lovable 快速出 MVP。首月专注于 10 个付费种子用户，收集反馈迭代。行业人脉和口碑传播是核心增长引擎。",
    category: "micro-saas",
    creator_level: "high",
    compound_potential: "high",
    mrr_range: "$2K-8K",
    pricing: "$49-199/月",
    mvp_time: "1-2月",
    refs: [
      { label: "IdeaProof", url: "https://ideaproof.io/lists/micro-saas-ideas" },
      { label: "Swfte Build SaaS with AI 2026", url: "https://www.swfte.com/blog/build-saas-with-ai-2026" }
    ],
    tags: ["垂直SaaS", "行业AI", "低竞争高留存"],
    rank: 2
  },

  // ═══ design-assets (2条) ═══
  {
    title: "DesignAI Market — AI 设计资产交易市场",
    description: "AI 生成的设计资产交易市场正在 2026 年经历爆发式增长。Canva、Figma 等设计平台已深度集成 AI 能力，但设计师仍然需要高质量、可商用的 AI 设计模板和资产作为创作起点。该平台定位为聚焦 AI 增强设计资产的垂直市场，提供 AI 生成的品牌套件、社交媒体模板、演示文稿主题、UI 组件库等数字资产。设计师可以将 AI 辅助创作的作品打包出售，买家获得即用型设计资源。2026 年全球数字设计资产市场规模已突破 120 亿美元，AI 生成资产的占比快速增长，为独立设计师创造了前所未有的变现机遇。",
    insight: "聚焦一个子品类（如 Notion 风格插画包或 SaaS 落地页模板），用 Midjourney + Figma 批量生产，在 Gumroad 或自建站台上架。初期免费提供 3-5 个样本吸引流量，用邮件列表沉淀用户，逐步转化付费。",
    category: "design-assets",
    creator_level: "low",
    compound_potential: "medium",
    mrr_range: "$500-2K",
    pricing: "$15-49/套",
    mvp_time: "2-3周",
    refs: [
      { label: "Krumzi Best AI Design Tools 2026", url: "https://www.krumzi.com/blog/best-ai-design-tools-in-2026-12-picks-for-stunning-visuals-without-design-skills" },
      { label: "Guideflow AI Design Tools", url: "https://www.guideflow.com/blog/ai-design-tools" }
    ],
    tags: ["AI设计资产", "模板经济", "被动收入"],
    rank: 3
  },
  {
    title: "BrandAI Kit — 品牌一键生成工具",
    description: "BrandAI Kit 面向小微企业和独立创作者的 AI 品牌资产生成工具。用户输入品牌名称和行业关键词，系统自动生成完整的品牌视觉包：Logo 变体、配色方案、字体搭配、社交媒体头像、名片设计、品牌指南文档等。与 Canva 等通用设计工具不同，该工具专注于品牌一致性和系统化输出，确保所有资产在视觉风格上保持统一。2026 年全球新增注册企业超过 3 亿家，其中 90% 以上为小微企业，对低成本品牌设计解决方案的需求持续旺盛。AI 驱动的品牌自动化正在成为设计民主化的重要推动力。",
    insight: "搭建基于 Stable Diffusion + Brandmark API 的品牌生成工作流，用 n8n 串联自动化流程，以 Web App 形式交付。首周可通过 Product Hunt 冷启动获取初始用户，提供一次免费生成作为引流钩子。",
    category: "design-assets",
    creator_level: "medium",
    compound_potential: "medium",
    mrr_range: "$1K-3K",
    pricing: "$29-79/品牌包",
    mvp_time: "3-4周",
    refs: [
      { label: "Style3D 2026 Design Charts", url: "https://www.style3d.com/blog/which-generative-ai-tops-2026-design-charts" },
      { label: "Krumzi Design Tools Tested", url: "https://www.krumzi.com/blog/best-ai-design-tools-in-2026-12-picks-for-stunning-visuals-without-design-skills" }
    ],
    tags: ["品牌自动化", "AI设计", "小微企业"],
    rank: 4
  },

  // ═══ automation (2条) ═══
  {
    title: "FlowAI — 无代码 AI 工作流自动化平台",
    description: "FlowAI 是一个面向非技术用户的 AI 工作流自动化平台，允许用户通过拖拽方式构建包含 AI 步骤的自动化流程。与 n8n、Make 等通用自动化工具不同，该平台深度聚焦 AI 驱动的业务场景：智能邮件分类与回复、社交媒体内容自动生成与排期、客户反馈情感分析、多语言内容自动翻译与发布等。2026 年无代码 AI 自动化市场持续增长，中小企业越来越依赖这类工具降低运营成本。平台提供 50+ 预建 AI 模板，用户可在 5 分钟内完成配置，大幅降低 AI 自动化的使用门槛。",
    insight: "Fork n8n 开源代码作为基础，添加 10 个高频 AI 节点模板，在 Product Hunt 发布 MVP。先免费吸引 100 个用户验证留存，再做付费分层。重点优化模板质量和用户体验，而非追求功能广度。",
    category: "automation",
    creator_level: "high",
    compound_potential: "high",
    mrr_range: "$3K-10K",
    pricing: "$19-99/月",
    mvp_time: "4-6周",
    refs: [
      { label: "Parix No-Code AI Automation 2026", url: "https://parix.ai/blog/no-code-ai-automation-2026" },
      { label: "Gend Top No-Code Tools 2026", url: "https://www.gend.co/blog/top-no-code-tools-2026-enhance-with-ai-agents" },
      { label: "Smartoo Top 15 No-Code AI", url: "https://smartoo.io/blog/top-15-no-code-ai-workflow-automation-tools-2026" }
    ],
    tags: ["无代码AI", "工作流自动化", "中小企业"],
    rank: 5
  },
  {
    title: "AgentDesk — AI 代理办公助手",
    description: "AgentDesk 将多个 AI Agent 整合为一个统一的办公自动化平台。用户可以配置专属的 AI 代理来处理重复性任务：会议纪要自动生成与分发、邮件智能归档与优先级排序、日程智能协调、文档自动分类与摘要。与单一功能的 AI 工具不同，该平台的核心价值在于跨工具协作——AI 代理可以在 Gmail、Slack、Notion、Google Calendar 之间自动流转信息。2026 年 AI Agent 框架逐渐成熟，个人和小团队可以用极低成本部署高效的虚拟助理，AI 代理正在从概念验证走向实际生产应用。",
    insight: "先做一个细分场景（如自动生成周报+会议纪要），用 LangChain + Google Workspace API 实现核心功能。通过 Slack 社区和 LinkedIn 面向远程团队推广，免费试用 14 天转化付费。从单一场景证明价值后横向扩展。",
    category: "automation",
    creator_level: "high",
    compound_potential: "high",
    mrr_range: "$2K-5K",
    pricing: "$29-149/月",
    mvp_time: "4-6周",
    refs: [
      { label: "UI Bakery No-Code AI Platforms 2026", url: "https://uibakery.io/blog/top-no-code-ai-platforms" },
      { label: "EnlightLab AI No-Code Tools", url: "https://enlightlab.com/10-best-ai-no-code-tools" },
      { label: "Smartoo Workflow Automation", url: "https://smartoo.io/blog/top-15-no-code-ai-workflow-automation-tools-2026" }
    ],
    tags: ["AI代理", "办公自动化", "远程协作"],
    rank: 6
  },

  // ═══ content-monetize (2条) ═══
  {
    title: "ContentAI Pay — AI 内容付费订阅平台",
    description: "ContentAI Pay 是一个帮助独立内容创作者建立 AI 增强型付费订阅的平台。平台集成了 AI 写作助手、多平台分发、付费墙管理、会员分析和 AI 驱动的个性化推荐功能。创作者可以在平台上创建付费 newsletter、独家分析报告、AI 辅助的个性化内容服务。2026 年内容创作者经济持续增长，越来越多的独立作者和领域专家通过付费订阅实现收入多元化。平台的核心差异化在于 AI 不仅辅助创作，还帮助创作者理解读者偏好、优化内容策略，实现数据驱动的内容运营。",
    insight: "从 Substack + Ghost 的生态中找差异化——聚焦中文市场或特定垂直领域（如投资分析、行业研究），用 AI 生成付费内容的初稿和数据图表，人工润色后发布。先以 Newsletter 形式验证内容价值，积累 500 订阅者后再引入付费层级。",
    category: "content-monetize",
    creator_level: "medium",
    compound_potential: "high",
    mrr_range: "$1K-5K",
    pricing: "$9-49/月（读者端）",
    mvp_time: "2-3周",
    refs: [
      { label: "NeuraPlus Monetize AI Content 2026", url: "https://neuraplus-ai.github.io/blog/how-to-monetize-ai-content-2026.html" },
      { label: "Taskade One-Person Companies", url: "https://www.taskade.com/blog/one-person-companies" }
    ],
    tags: ["内容变现", "AI写作", "付费订阅"],
    rank: 7
  },
  {
    title: "VidBrief AI — 视频内容二次变现工具",
    description: "VidBrief AI 帮助内容创作者从长视频中自动提取高价值片段，生成多平台适配的短视频、图文摘要和付费深度分析。平台支持 YouTube、B站、播客等长内容源的自动导入，AI 自动识别高互动潜力片段，一键生成 TikTok/Reels/Shorts 格式的短视频，同时提取核心观点生成付费 newsletter 或深度报告。2026 年视频内容再创作市场快速增长，创作者需要高效的工具将一次创作转化为多渠道收入。该工具尤其适合知识型创作者将长内容资产最大化利用。",
    insight: "基于 Whisper + GPT + FFmpeg 搭建视频处理和摘要管线，先服务 5-10 个中腰部 YouTuber/B 站 UP 主验证付费意愿。按视频处理量或收入分成模式定价。MVP 可聚焦单一平台（如 B站）起步，跑通后再扩展到其他平台。",
    category: "content-monetize",
    creator_level: "medium",
    compound_potential: "medium",
    mrr_range: "$2K-6K",
    pricing: "$19-99/月",
    mvp_time: "3-4周",
    refs: [
      { label: "NeuraPlus AI Monetization", url: "https://neuraplus-ai.github.io/blog/how-to-monetize-ai-content-2026.html" },
      { label: "Watashi Games AI Tools for Creators", url: "https://watashigames.com/blog/ai-tools-indie-developers-2026" }
    ],
    tags: ["视频变现", "内容复用", "AI剪辑"],
    rank: 8
  },

  // ═══ indie-tool (2条) ═══
  {
    title: "ShipFast AI — 独立开发者快速交付平台",
    description: "ShipFast AI 是一个专为独立开发者设计的全栈快速交付平台，集成了 AI 代码生成、一键部署、分析监控和用户反馈管理。平台支持从需求描述直接生成可运行的全栈应用骨架，内置常用的认证、支付、数据库、文件存储等模块，开发者只需关注业务逻辑。2026 年独立开发者群体持续壮大，越来越多的创作者希望以最低的技术门槛将创意变为产品。该工具将开发周期从数月缩短至数周甚至数天，让独立开发者能够快速验证想法、高效迭代。",
    insight: "基于 Bolt/Lovable + Supabase + Stripe 的标准技术栈，构建一套预配置的 SaaS 模板库。面向独立开发者社区（Indie Hackers、Product Hunt）免费提供 3 个模板获取初始用户，通过增值模板和高级服务收费。核心价值在于节省开发者的重复搭建时间。",
    category: "indie-tool",
    creator_level: "high",
    compound_potential: "high",
    mrr_range: "$3K-10K",
    pricing: "$49-199/月",
    mvp_time: "4-6周",
    refs: [
      { label: "ShareUHack Indie Maker Budget 2026", url: "https://www.shareuhack.com/en/posts/indie-maker-ai-tool-stack-budget-guide-2026" },
      { label: "Watashi Games AI Dev Tools", url: "https://watashigames.com/blog/ai-tools-indie-developers-2026" }
    ],
    tags: ["独立开发", "AI开发工具", "快速交付"],
    rank: 9
  },
  {
    title: "SoonLab — AI 游戏创作平台",
    description: "SoonLab 是一个 AI 驱动的轻量级游戏创作平台，允许没有任何编程经验的用户通过自然语言描述来创建可玩的小游戏。平台整合了 AI 代码生成、游戏素材自动生成、一键发布和内置变现功能。与传统游戏引擎不同，该平台面向的是休闲游戏创作者和教育场景。2026 年独立游戏市场规模达到 55.4 亿美元，同时教育科技领域对互动式学习内容的需求也在快速增长。该平台降低了游戏创作的门槛，使任何人都能成为游戏创作者，推动游戏创作的大众化。",
    insight: "聚焦超休闲游戏和互动教育内容两个细分方向，用 Phaser.js + AI 代码生成为技术基座。在 TikTok 和 Reddit 游戏社区展示用平台制作的作品来引流，免费创建+发布，通过高级素材和去广告收费。社区驱动的内容生态是长期壁垒。",
    category: "indie-tool",
    creator_level: "high",
    compound_potential: "medium",
    mrr_range: "$1K-5K",
    pricing: "免费+增值（$9-29/月）",
    mvp_time: "2-3月",
    refs: [
      { label: "SoonLab Indie Hackers", url: "https://www.indiehackers.com/post/indie-game-maker-ai-platform-4d54d836236" },
      { label: "Mordor Intelligence Indie Game Market", url: "https://www.mordorintelligence.com/industry-reports/indie-game-market" }
    ],
    tags: ["AI游戏", "无代码创作", "独立游戏"],
    rank: 10
  },

  // ═══ digital-product (2条) ═══
  {
    title: "PromptPack Pro — AI 提示词商品化平台",
    description: "PromptPack Pro 是一个 AI 提示词（Prompt）的商业化平台，帮助领域专家将专业知识和经验转化为可销售的 AI 提示词包。平台提供提示词的结构化管理、效果测试、版本控制和一键发布到多个 AI 平台（ChatGPT、Claude、Midjourney 等）。2026 年 AI 工具的普及催生了巨大的提示词需求，优质提示词可以显著提升 AI 输出质量。企业用户和个人消费者愿意为经过验证的高质量提示词付费，提示词市场正在成为数字产品经济的新增长点，为各领域的知识工作者提供了低门槛的变现路径。",
    insight: "选择一个专业领域（如法律文书、医疗咨询、市场营销），整理 50-100 个高质量提示词，打包为可销售的数字产品。在 PromptBase、Etsy、Gumroad 等多个渠道分销。先免费分享 10 个样本建立信任，用社交媒体展示使用效果来引流。",
    category: "digital-product",
    creator_level: "low",
    compound_potential: "medium",
    mrr_range: "$500-3K",
    pricing: "$9-49/包",
    mvp_time: "1-2周",
    refs: [
      { label: "Kittl Digital Products 2026", url: "https://www.kittl.com/blogs/digital-products-to-sell-dsi" },
      { label: "CommercePundit AI Business Ideas", url: "https://www.commercepundit.com/blog/22-ai-business-ideas-that-are-quietly-making-people-rich-in-2026" }
    ],
    tags: ["提示词经济", "数字产品", "知识变现"],
    rank: 11
  },
  {
    title: "TemplateAI Hub — AI 驱动数字产品创作平台",
    description: "TemplateAI Hub 是一个帮助创作者将专业知识转化为可销售数字产品的 AI 平台。用户输入擅长领域，AI 自动推荐适合的数字产品形式（电子书、模板包、在线课程大纲、检查清单、计算工具等），并辅助完成内容生成、排版设计和销售页面制作。平台支持一键发布到 Gumroad、Etsy、Notion 模板市场等渠道，同时提供内置的销售分析和用户反馈追踪。2026 年数字产品市场规模持续扩大，AI 正在将数字产品创作的时间成本降低 80% 以上，一人企业模式迎来前所未有的效率跃升。",
    insight: "框架本身即是产品——先自己使用这个工作流程批量创建 5-10 个数字产品，验证从创意到销售的完整链路，再将整个过程产品化。通过 Build in Public 的方式在社交媒体上分享收入数据吸引早期用户，公信力来自真实成果展示。",
    category: "digital-product",
    creator_level: "medium",
    compound_potential: "high",
    mrr_range: "$1K-4K",
    pricing: "$19-59/月",
    mvp_time: "3-4周",
    refs: [
      { label: "PrometAI Solopreneur Tech Stack 2026", url: "https://prometai.app/blog/solopreneur-tech-stack-2026" },
      { label: "Kittl Profitable Digital Products", url: "https://www.kittl.com/blogs/digital-products-to-sell-dsi" },
      { label: "Taskade One-Person Companies", url: "https://www.taskade.com/blog/one-person-companies" }
    ],
    tags: ["数字产品", "AI创作", "一人企业"],
    rank: 12
  }
];

async function main() {
  const key = await getKey();

  console.log('🔄 开始写入 W27 周报数据...');
  console.log(`📋 共 ${newsItems.length} 条内容`);
  console.log(`🔑 使用 service_role key (${key.substring(0, 20)}...)\n`);

  // 1. Check if W27 already exists
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/weekly_issues?slug=eq.2026-w27&select=id,slug`,
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
    console.log(`⚠️  W27 已存在 (id: ${issueId})，将覆盖 news_items\n`);
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
          slug: '2026-w27',
          issue_number: 27,
          year: 2026,
          week_number: 27,
          week_start: '2026-06-29',
          week_end: '2026-07-05',
          title: 'AI OPC Weekly #27',
          summary: '本周精选12个独立创作者AI创业机会',
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

  console.log(`\n🎉 W27 周报数据写入完成!`);
  console.log(`🌐 查看: https://www.aiopcnews.com/weekly/2026-w27`);
}

main().catch(console.error);
