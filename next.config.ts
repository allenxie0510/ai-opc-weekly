import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose only the non-sensitive feature-flag value so the client navigation and
  // server routes obey the same XHS_PRODUCT_RADAR_ENABLED switch.
  env: {
    NEXT_PUBLIC_XHS_PRODUCT_RADAR_ENABLED:
      process.env.XHS_PRODUCT_RADAR_ENABLED
      ?? process.env.NEXT_PUBLIC_XHS_PRODUCT_RADAR_ENABLED
      ?? 'true',
  },
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
