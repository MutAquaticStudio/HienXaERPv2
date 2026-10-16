// @vitest-environment node
import { expect, it } from "vitest";
import nextConfig, { NOT_FOUND_SEGMENT } from "../next.config";

it("sends every switched-off quotation route to a real 404 before routing (owner decision D1)", async () => {
  const rewrites = await nextConfig.rewrites!();
  expect(Array.isArray(rewrites)).toBe(false);
  const before = Array.isArray(rewrites) ? [] : rewrites.beforeFiles;
  expect(before).toEqual([
    { source: "/admin/quotations", destination: `/admin/${NOT_FOUND_SEGMENT}` },
    { source: "/admin/quotations/:path*", destination: `/admin/${NOT_FOUND_SEGMENT}` },
    { source: "/customer/quotations", destination: `/customer/${NOT_FOUND_SEGMENT}` },
    { source: "/customer/quotations/:path*", destination: `/customer/${NOT_FOUND_SEGMENT}` },
  ]);
});
