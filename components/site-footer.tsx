import Link from 'next/link';
import { BrandLogo } from './brand-logo';
import { EditorialLinks } from './editorial-links';
import { WechatContact } from './wechat-contact';

export function SiteFooter() {
  return <footer className="site-footer" id="contact">
    <div className="site-footer-inner">
      <div className="site-footer-top">
        <div className="site-footer-identity">
          <div className="site-footer-brand-copy">
            <Link href="/" className="site-footer-logo" aria-label="AI OPC 首页"><BrandLogo surface="dark" /></Link>
            <p className="site-footer-slogan">AI 一人公司精选资讯</p>
          </div>
          <WechatContact />
        </div>
        <nav className="site-footer-content" aria-label="页脚内容导航">
          <h2 className="site-footer-heading">探索内容</h2>
          <Link href="/sources">信源与编辑标准</Link>
          <Link href="/news/saved">我的收藏</Link>
          <Link href="/news">精选资讯</Link>
          <Link href="/weekly">周报</Link>
          <Link href="/news?view=all&source=x">X 中文动态</Link><a href="/feed.xml">RSS 订阅</a><Link href="/explore">方向探测器 · 实验工具</Link>
        </nav>
        <div className="site-footer-support">
          <h2 className="site-footer-heading">关于与联系</h2>
          <EditorialLinks />
        </div>
      </div>
      <div className="site-footer-bottom"><p>© 2026 AI OPC. All rights reserved.</p></div>
    </div>
  </footer>;
}
