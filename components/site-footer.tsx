import Link from 'next/link';
import { EditorialLinks } from './editorial-links';
import { PageViewCounter } from './page-view-counter';
import { WechatContact } from './wechat-contact';

export function SiteFooter() {
  return <footer className="site-footer" id="contact">
    <div className="site-footer-inner">
      <div className="site-footer-top">
        <div className="site-footer-identity">
          <Link href="/" className="site-footer-logo" aria-label="AI OPC 首页">AI OPC</Link>
          <p className="site-footer-slogan">一人公司机会情报</p>
          <WechatContact />
        </div>
        <EditorialLinks />
        <PageViewCounter variant="statistic" label="累计访问数" />
      </div>
      <div className="site-footer-bottom"><p>© 2026 AI OPC. All rights reserved.</p></div>
    </div>
  </footer>;
}
