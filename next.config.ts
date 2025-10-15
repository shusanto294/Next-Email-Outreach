import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  productionBrowserSourceMaps: false,
  // Workaround for Next.js 15 error page generation bug
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
};

export default nextConfig;
