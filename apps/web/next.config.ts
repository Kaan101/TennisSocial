import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@club/shared", "@club/types", "@club/ui"],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
