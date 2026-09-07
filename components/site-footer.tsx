import Link from 'next/link';
import { EditorialLinks } from './editorial-links';
import { PageViewCounter } from './page-view-counter';
import { WechatContact } from './wechat-contact';

export function SiteFooter() {
  return <footer className="site-footer" id="contact">
    <div className="site-footer-inner">
      <div className="site-footer-top">
        <div className="site-footer-identity">
          <div className="site-footer-brand-copy">
            <Link href="/" className="site-footer-logo" aria-label="AI OPC 首页">AI OPC</Link>
            <p className="site-footer-slogan">一人公司机会情报</p>
          </div>
          <WechatContact />
        </div>
        <nav className="site-footer-content" aria-label="页脚内容导航">
          <h2 className="site-footer-heading">探索内容</h2>
          <Link href="/opportunities">机会库</Link>
          <Link href="/explore">方向探测器</Link>
          <Link href="/radar">每日信号</Link>
          <Link href="/archive">周报</Link>
          <Link href="/x">X 动态</Link>
        </nav>
        <div className="site-footer-support">
          <h2 className="site-footer-heading">关于与联系</h2>
          <EditorialLinks />
        </div>
        <PageViewCounter variant="statistic" label="累计访问数" />
      </div>
      <div className="site-footer-bottom"><p>© 2026 AI OPC. All rights reserved.</p></div>
    </div>
  </footer>;
}
