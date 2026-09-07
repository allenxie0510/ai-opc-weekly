import Link from 'next/link';
import { Header } from '@/components/page-shell';
import { EditorialLinks } from '@/components/editorial-links';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '关于与编辑方法 · AI OPC', description: '了解 AI OPC 如何筛选一人公司机会、区分来源与判断，以及反馈纠错。' };

export default function AboutPage() {
  return <><Header /><main className="container page-wrap editorial-page">
    <header className="product-intro"><p className="product-eyebrow">AI OPC · 一人公司机会情报</p><h1>帮助一个人，<br />更有依据地选择和行动。</h1><p>面向设计师、开发者和专业服务者：从真实的 AI 应用信号出发，理解具体客户的痛点，再决定值得测试什么。</p></header>
    <section><h2>谁在做这件事</h2><p>AI OPC 由 Allen 维护。AI 协助整理信息与生成研究草稿，公开内容通过网站审核台发布。内容仍可能存在遗漏或推断错误，欢迎带着原始证据反馈。</p><a href="https://github.com/allenxie0510/ai-opc-weekly" target="_blank" rel="noopener noreferrer">查看公开项目与更新记录</a></section>
    <section id="method"><h2>如何阅读一条机会</h2><div className="decision-grid"><article><h3>来源与摘录</h3><p>查看原始链接、日期和适用范围。来源等级描述信息出处，不代表它支持文章中的每一个结论；摘录也需要回到原文核对上下文。</p></article><article><h3>分析与推断</h3><p>机会论断、评分与编辑判断是研究意见。OPC 分数帮助比较候选，不是成功概率、收入预测或回报保证。</p></article><article><h3>待验证假设</h3><p>验证计划是待执行的实验。口头认可、参与试用、持续使用和真实付款是不同强度的信号，必须分别记录。</p></article></div></section>
    <section><h2>来源等级与证据边界</h2><p>S / A / B / C / D 是来源类型标记，从一手材料、结构化资料到媒体、社区和二手信息。我们会检查链接及可核对的摘录，但来源权威、链接可达，都不能单独证明某个创业机会成立。</p><p>历史内容如缺少逐条核对记录，会显示“支持程度未复核”。跨行业案例应作为背景材料，不能直接证明目标客户愿意付费。收入缺少来源时标为“来源待核实”；估算必须与实际披露区分。</p></section>
    <section><h2>从阅读到一次小实验</h2><ol><li>核对机会的目标客户是否与你能接触的人重合。</li><li>写下最可能不成立的假设和可承受的时间、预算。</li><li>先收集客户行为，再决定是否投入原型开发。</li><li>保存探索，记录支持与反对的证据，再回来调整判断。</li></ol><Link className="product-action" href="/explore">了解方向探测器</Link></section>
    <section id="corrections"><h2>反馈与纠错</h2><p>发现链接失效、摘录不符、收入缺少依据或结论过度推断，请提供页面地址、具体问题及原始来源。反馈入口使用 GitHub，需要 GitHub 账号；提交内容会公开，请勿附上邮箱验证码、客户资料等个人信息。</p><a className="product-action secondary" href="https://github.com/allenxie0510/ai-opc-weekly/issues/new?title=%E5%86%85%E5%AE%B9%E7%BA%A0%E9%94%99&body=%E9%A1%B5%E9%9D%A2%E5%9C%B0%E5%9D%80%EF%BC%9A%0A%E5%85%B7%E4%BD%93%E9%97%AE%E9%A2%98%EF%BC%9A%0A%E5%8E%9F%E5%A7%8B%E6%9D%A5%E6%BA%90%EF%BC%9A" target="_blank" rel="noopener noreferrer">提交纠错或建议</a></section>
    <section id="cooperation"><h2>商业合作边界</h2><p>赞助、付费介绍及佣金链接须明确标注。商业合作不能购买高分、修改证据标准或替代编辑结论。合作提议可通过项目反馈入口联系，初期不承诺未经核实的曝光量和获客效果。</p></section>
    <section><h2>免费阅读与订阅</h2><p>资讯、公开机会和历史周报无需登录。将 RSS 地址加入阅读器，即可随已发布周报更新；RSS 不收集邮箱，也不会发送登录邮件。</p><Link href="/feed.xml">打开周报 RSS</Link><p className="product-note">方向探测器目前没有付款入口。登录用于使用 AI 功能和保存探索；具体服务可用性以页面提示为准。</p></section>
    <EditorialLinks />
  </main></>;
}
