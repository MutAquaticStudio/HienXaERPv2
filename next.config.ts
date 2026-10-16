import type { NextConfig } from "next";
import { QUOTATIONS_ENABLED } from "./src/lib/features";

/** No route matches this path, so a rewrite to it renders the not-found page with a real 404 status. */
export const NOT_FOUND_SEGMENT = "__khong-tim-thay";

const nextConfig: NextConfig = {
  // Owner decision D1: switched-off quotation screens must answer 404. The layout-level notFound() alone renders the
  // not-found page with HTTP 200, because the root loading boundary has already started streaming.
  async rewrites() {
    if (QUOTATIONS_ENABLED) return [];
    return {
      beforeFiles: ["admin", "customer"].flatMap((surface) => [
        { source: `/${surface}/quotations`, destination: `/${surface}/${NOT_FOUND_SEGMENT}` },
        { source: `/${surface}/quotations/:path*`, destination: `/${surface}/${NOT_FOUND_SEGMENT}` },
      ]),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
