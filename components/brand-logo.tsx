/** Original SVGs stay intact; <picture> switches immediately with browser theme changes. */
export function BrandLogo({ surface = 'auto' }: { surface?: 'auto' | 'dark' }) {
  return (
    <picture className="brand-logo">
      {surface === 'auto' && (
        <source media="(prefers-color-scheme: dark)" srcSet="/brand/aiopclogo-dark.svg" />
      )}
      {/* SVG assets need no raster optimization; intrinsic dimensions reserve their aspect ratio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/brand/aiopclogo-${surface === 'dark' ? 'dark' : 'light'}.svg`}
        alt="AI OPC"
        width={2291}
        height={689}
        draggable={false}
      />
    </picture>
  );
}
