'use client';

/**
 * 机会卡片封面图（Supabase Storage 公共 URL）
 * - 加载中：保持空白（容器底色），不显示兜底封面（用户决策 2026-08-12：加载前的橙色预览图删除）
 * - 加载失败：卸载 img，渲染 children 传入的程序化兜底封面
 */
import { useState, type ReactNode } from 'react';

export function CoverImg({ src, alt, children }: { src: string; alt: string; children?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{children}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  );
}
