import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files read at runtime through computed paths, which the tracer can't see:
  // saved CMC responses (fixture mode and the fallback) and the share image's assets.
  outputFileTracingIncludes: {
    "/*": ["./fixtures/**/*"],
    "/api/*": ["./fixtures/**/*"],
    "/api/og": ["./app/api/og/bg/*", "./app/api/og/fonts/*"],
  },
};

export default nextConfig;
