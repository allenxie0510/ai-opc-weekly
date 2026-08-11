'use client';

/**
 * 机会卡片封面图（Supabase Storage 公共 URL）
 * 加载失败自动卸载，露出底层的程序化兜底封面
 */
import { useState } from 'react';

export function CoverImg({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  );
}
