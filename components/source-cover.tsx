'use client';

import { useState } from 'react';

/** Hide a failed source image instead of showing a broken image or unrelated stock art. */
export function SourceCover({ src, alt, sourceUrl, sourceLabel, className = '', priority = false }: {
  src?: string | null; alt: string; sourceUrl?: string | null; sourceLabel?: string;
  className?: string; priority?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src || !/^https?:\/\//i.test(src)) return null;
  let label = sourceLabel || '原始来源';
  if (!sourceLabel && sourceUrl) { try { label = new URL(sourceUrl).hostname.replace(/^www\./, ''); } catch {} }
  return <figure className={`source-cover ${className}`}>
    {/* Source images are already copied to our Storage bucket, with a stable content-based URL. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" onError={() => setFailedSrc(src)} />
    {sourceUrl && /^https?:\/\//i.test(sourceUrl) && <figcaption>
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">图片来源 · {label} ↗</a>
    </figcaption>}
  </figure>;
}
