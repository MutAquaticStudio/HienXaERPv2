import type { NextConfig } from "next";
import { PAYMENT_NOTICES_ENABLED, QUOTATIONS_ENABLED } from "./src/lib/features";

/** No route matches this path, so a rewrite to it renders the not-found page with a real 404 status. */
export const NOT_FOUND_SEGMENT = "__khong-tim-thay";

const nextConfig: NextConfig = {
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
