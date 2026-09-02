function hash(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function VisualMark({ index }: { index: number }) {
  const marks = [
    <path key="diamond" d="m12 3 8 9-8 9-8-9z" />,
    <circle key="circle" cx="12" cy="12" r="8" />,
    <path key="triangle" d="M12 3 21 20H3z" />,
    <rect key="square" x="4" y="4" width="16" height="16" rx="2" />,
    <path key="spark" d="m12 2 1.8 7.2L21 12l-7.2 2.8L12 22l-1.8-7.2L3 12l7.2-2.8z" />,
    <g key="target"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></g>,
  ];
  return (
    <svg className="pr-visual-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {marks[index]}
    </svg>
  );
}

export function ProductVisual({ slug, title, compact = false }: { slug: string; title: string; compact?: boolean }) {
  const index = hash(slug) % 6;
  return (
    <div className={`pr-visual tone-${index} ${compact ? 'compact' : ''}`} role="img" aria-label={`${title}概念占位图`}>
      <VisualMark index={index} />
      <span className="pr-visual-label">{title}</span>
      <span className="pr-visual-note">PRODUCT SIGNAL</span>
    </div>
  );
}
