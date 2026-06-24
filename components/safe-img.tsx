'use client';

interface Props {
  src: string;
  alt?: string;
  className?: string;
}

export function SafeImg({ src, alt = '', className }: Props) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        // 隐藏加载失败的图片
        const target = e.currentTarget;
        target.style.display = 'none';
      }}
    />
  );
}
