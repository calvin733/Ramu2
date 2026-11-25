import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 1, serverActions: { bodySizeLimit: "3mb" } },
};

export default nextConfig;
