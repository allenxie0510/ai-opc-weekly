'use client';

/**
 * 雷达卡片封面图（OG image，经 /api/img-proxy 代理）
 * 加载失败自动隐藏，退化为纯文字卡片
 */
import { useState } from 'react';

export function RadarCover({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="radar-cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/img-proxy?url=${encodeURIComponent(src)}`}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
