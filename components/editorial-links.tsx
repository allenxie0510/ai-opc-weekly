import Link from 'next/link';

export function EditorialLinks() {
  return <nav className="editorial-links" aria-label="网站说明">
    <Link href="/about">关于与编辑方法</Link>
    <Link href="/about#corrections">反馈与纠错</Link>
    <Link href="/about#cooperation">商业合作说明</Link>
    <Link href="/feed.xml">RSS 周报订阅</Link>
  </nav>;
}
