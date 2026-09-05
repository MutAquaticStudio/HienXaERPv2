import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep static page titles in the HTML head during action revalidation.
  // Only metadata is blocking; module content can still stream independently.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
