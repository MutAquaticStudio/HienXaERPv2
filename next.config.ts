import type { NextConfig } from "next";
import { PAYMENT_NOTICES_ENABLED, QUOTATIONS_ENABLED } from "./src/lib/features";
import { securityHeaders } from "./src/lib/security-headers";

/** No route matches this path, so a rewrite to it renders the not-found page with a real 404 status. */
export const NOT_FOUND_SEGMENT = "__khong-tim-thay";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Security scan 04/11/2026 (P2): CSP, anti-framing, nosniff, referrer and permissions headers on every answer.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      dev: process.env.NODE_ENV === "development", preview: process.env.VERCEL_ENV === "preview" }) }];
  },
  // D50: a question to the assistant may carry up to 3,5 MB of files (src/modules/ai/attachment-limits.ts); the default
  // 1 MB Server Action body would refuse them. Kept under Vercel's 4,5 MB request limit.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Owner decisions D1 and D8: switched-off quotation and payment-notice screens must answer 404. The layout-level
  // notFound() alone renders the not-found page with HTTP 200, because the root loading boundary has already started streaming.
  async rewrites() {
    const off = [
      ...(QUOTATIONS_ENABLED ? [] : ["admin", "customer"].map((surface) => ({ surface, route: "quotations" }))),
      ...(PAYMENT_NOTICES_ENABLED ? [] : [{ surface: "admin", route: "payment-notices" }]),
    ];
    if (!off.length) return [];
    return {
      beforeFiles: off.flatMap(({ surface, route }) => [
        { source: `/${surface}/${route}`, destination: `/${surface}/${NOT_FOUND_SEGMENT}` },
        { source: `/${surface}/${route}/:path*`, destination: `/${surface}/${NOT_FOUND_SEGMENT}` },
      ]),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
