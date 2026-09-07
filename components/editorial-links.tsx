import Link from 'next/link';

export function EditorialLinks() {
  return <nav className="editorial-links" aria-label="网站说明">
    <Link href="/about#corrections">反馈与纠错</Link>
    <Link href="/about#cooperation">商业合作说明</Link>
  </nav>;
}
