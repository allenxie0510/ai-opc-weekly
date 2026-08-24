import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Expose only non-sensitive feature flags so client navigation and server routes
  // obey the same deployment switches. The tools product layer is opt-in.
  env: {
    NEXT_PUBLIC_TOOLS_ENABLED:
      process.env.TOOLS_ENABLED
      ?? process.env.NEXT_PUBLIC_TOOLS_ENABLED
      ?? 'false',
    NEXT_PUBLIC_XHS_PRODUCT_RADAR_ENABLED:
      process.env.XHS_PRODUCT_RADAR_ENABLED
      ?? process.env.NEXT_PUBLIC_XHS_PRODUCT_RADAR_ENABLED
      ?? 'true',
  },
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
