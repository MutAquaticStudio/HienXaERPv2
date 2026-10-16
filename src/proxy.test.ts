// @vitest-environment node
import { existsSync } from "node:fs";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest, NextResponse } from "next/server";
import { expect, it, vi } from "vitest";

const refreshAuthSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/proxy", () => ({ refreshAuthSession }));

import { config, proxy } from "./proxy";

const root = new URL("../", import.meta.url);

it("sits next to the app directory so Next registers it (a root proxy.ts is ignored when the app lives in src)", () => {
  expect(existsSync(new URL("src/app", root))).toBe(true);
  expect(existsSync(new URL("src/proxy.ts", root))).toBe(true);
  for (const stray of ["proxy.ts", "proxy.js", "middleware.ts", "middleware.js", "src/middleware.ts"]) {
    expect(existsSync(new URL(stray, root)), stray).toBe(false);
  }
});

it("refreshes the Supabase session on pages, actions and API routes but not on static assets", () => {
  for (const url of ["/", "/login", "/admin", "/admin/sales/orders/new", "/customer", "/work", "/api/documents/pdf"]) {
    expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
  }
  for (const url of ["/_next/static/chunks/app.js", "/_next/image?url=x", "/favicon.ico", "/logo.svg", "/brand/hx.png"]) {
    expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
  }
});

it("hands every matched request to the session refresher", async () => {
  const response = NextResponse.next();
  refreshAuthSession.mockResolvedValueOnce(response);
  const request = new NextRequest("http://127.0.0.1:3000/admin");
  await expect(proxy(request)).resolves.toBe(response);
  expect(refreshAuthSession).toHaveBeenCalledWith(request);
});
