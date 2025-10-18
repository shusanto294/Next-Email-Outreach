import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  productionBrowserSourceMaps: false,
  // Workaround for Next.js 15 error page generation bug
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Use standalone output which skips problematic static page generation
  output: 'standalone',
  // Disable static generation of error pages
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
