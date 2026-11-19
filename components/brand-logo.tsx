/** Logo follows its actual surface, independently of the operating-system theme. */
export function BrandLogo({ surface = 'auto' }: { surface?: 'auto' | 'dark' }) {
  return (
    <picture className="brand-logo">
      {/* SVG assets need no raster optimization; intrinsic dimensions reserve their aspect ratio. */}
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
