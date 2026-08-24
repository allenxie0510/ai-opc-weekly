const VISUALS = ['◇', '○', '△', '□', '✦', '◎'];

function hash(value: string): number {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

export function ProductVisual({ slug, title, compact = false }: { slug: string; title: string; compact?: boolean }) {
  const index = hash(slug) % VISUALS.length;
  return (
    <div className={`pr-visual tone-${index} ${compact ? 'compact' : ''}`} role="img" aria-label={`${title}概念占位图`}>
      <span className="pr-visual-mark" aria-hidden="true">{VISUALS[index]}</span>
      <span className="pr-visual-label">{title}</span>
      <span className="pr-visual-note">PRODUCT SIGNAL</span>
    </div>
  );
}
