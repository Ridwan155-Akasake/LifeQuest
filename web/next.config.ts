import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (web/Dockerfile).
  output: "standalone",
  // Server actions are the only write path; keep them same-origin.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
