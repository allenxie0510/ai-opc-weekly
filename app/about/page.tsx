import Link from 'next/link';
import { Header } from '@/components/page-shell';
import { AboutFaq, FaqItem } from '@/components/about-faq';
import { WechatContact } from '@/components/wechat-contact';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '关于与编辑方法 · AI OPC', description: '了解 AI OPC 如何筛选一人公司机会、区分来源与判断，以及反馈纠错。' };

export default function AboutPage() {
  return <><Header /><main className="container page-wrap editorial-page">
    <header className="product-intro"><p className="product-eyebrow">AI OPC · 一人公司机会情报</p><h1>帮助一个人，<br />更有依据地选择和行动。</h1><p>面向设计师、开发者和专业服务者：从真实的 AI 应用信号出发，理解具体客户的痛点，再决定值得测试什么。</p></header>
    <h2 className="faq-heading">Q&amp;A</h2>
    <AboutFaq>
      <FaqItem id="team" title="谁在做这件事" defaultOpen>
        <p>AI OPC 由 Allen 维护。AI 协助整理信息与生成研究草稿，公开内容通过网站审核台发布。内容仍可能存在遗漏或推断错误，欢迎带着原始证据反馈。</p>
      </FaqItem>
      <FaqItem id="method" title="如何阅读一条机会">
        <div className="decision-grid"><article><h4>来源与摘录</h4><p>查看原始链接、日期和适用范围。来源等级描述信息出处，不代表它支持文章中的每一个结论；摘录也需要回到原文核对上下文。</p></article><article><h4>分析与推断</h4><p>机会论断、评分与编辑判断是研究意见。OPC 分数帮助比较候选，不是成功概率、收入预测或回报保证。</p></article><article><h4>待验证假设</h4><p>验证计划是待执行的实验。口头认可、参与试用、持续使用和真实付款是不同强度的信号，必须分别记录。</p></article></div>
      </FaqItem>
      <FaqItem id="evidence" title="来源等级与证据边界">
        <p>S / A / B / C / D 是来源类型标记，从一手材料、结构化资料到媒体、社区和二手信息。我们会检查链接及可核对的摘录，但来源权威、链接可达，都不能单独证明某个创业机会成立。</p><p>历史内容如缺少逐条核对记录，会显示“支持程度未复核”。跨行业案例应作为背景材料，不能直接证明目标客户愿意付费。收入缺少来源时标为“来源待核实”；估算必须与实际披露区分。</p>
      </FaqItem>
      <FaqItem id="validation" title="从阅读到一次小实验">
        <ol><li>核对机会的目标客户是否与你能接触的人重合。</li><li>写下最可能不成立的假设和可承受的时间、预算。</li><li>先收集客户行为，再决定是否投入原型开发。</li><li>保存探索，记录支持与反对的证据，再回来调整判断。</li></ol><Link className="product-action" href="/explore">了解方向探测器</Link>
      </FaqItem>
      <FaqItem id="corrections" title="反馈与纠错">
        <p>发现链接失效、摘录不符、收入缺少依据或结论过度推断，请提供页面地址、具体问题及原始来源。请加入管理员微信进行反馈，多谢您的支持。</p>
        <WechatContact />
      </FaqItem>
      <FaqItem id="cooperation" title="商业合作边界">
        <p>赞助、付费介绍及佣金链接须明确标注。商业合作不能购买高分、修改证据标准或替代编辑结论。合作提议请扫描页面底部二维码添加管理员微信，初期不承诺未经核实的曝光量和获客效果。</p><a href="#contact">查看管理员微信二维码</a>
      </FaqItem>
      <FaqItem id="reading" title="免费阅读与订阅">
        <p>资讯、公开机会和历史周报无需登录。方向探测器目前没有付款入口。登录仅用于使用 AI 功能和保存探索；具体服务可用性以页面提示为准。</p>
      </FaqItem>
    </AboutFaq>
  </main></>;
}
