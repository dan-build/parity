import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let other machines on the LAN (e.g. a second Mac recording the demo) load the
  // dev server's scripts. Without this the page stays blank there: the reveal needs JS.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  // Files read at runtime through computed paths, which the tracer can't see:
  // saved CMC responses (fixture mode and the fallback) and the share image's assets.
  outputFileTracingIncludes: {
    "/*": ["./fixtures/**/*"],
    "/api/*": ["./fixtures/**/*"],
    "/api/og": ["./app/api/og/bg/*", "./app/api/og/fonts/*"],
  },
};

export default nextConfig;
