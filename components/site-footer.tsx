import { EditorialLinks } from './editorial-links';
import { PageViewCounter } from './page-view-counter';
import { WechatContact } from './wechat-contact';

export function SiteFooter() {
  return <footer className="site-footer" id="contact">
    <div className="site-footer-inner">
      <p className="site-footer-brand">AI OPC · 一人公司机会情报</p>
      <WechatContact />
      <EditorialLinks />
      <p><PageViewCounter /></p>
      <p>© 2026 AI OPC. All rights reserved.</p>
    </div>
  </footer>;
}
