import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders, supabaseOrigins } from "./security-headers";

const URL = "https://abcd.supabase.co";
const directive = (policy: string, name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

describe("security headers (security scan P2)", () => {
  it("sends CSP, anti-framing, nosniff, referrer and permissions headers", () => {
    const headers = Object.fromEntries(securityHeaders({ supabaseUrl: URL }).map(({ key, value }) => [key, value]));
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("lets the browser reach only the app and its Supabase project (https + realtime)", () => {
    const policy = contentSecurityPolicy({ supabaseUrl: URL });
    expect(directive(policy, "connect-src")).toBe(`connect-src 'self' ${URL} wss://abcd.supabase.co`);
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(directive(policy, "img-src")).toContain("https:");
    expect(directive(policy, "script-src")).not.toContain("unsafe-eval");
    expect(directive(policy, "frame-src")).toBe("frame-src 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows eval and the dev socket only in development, and Vercel's toolbar only on previews", () => {
    const dev = contentSecurityPolicy({ supabaseUrl: "http://127.0.0.1:54321", dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws://127.0.0.1:54321");
    expect(dev).not.toContain("upgrade-insecure-requests");
    const preview = contentSecurityPolicy({ supabaseUrl: URL, preview: true });
    expect(directive(preview, "frame-src")).toBe("frame-src https://vercel.live");
    expect(directive(contentSecurityPolicy({ supabaseUrl: URL }), "script-src")).not.toContain("vercel.live");
  });

  it("ignores a missing or malformed Supabase address", () => {
    expect(supabaseOrigins(undefined)).toEqual([]);
    expect(supabaseOrigins("not a url")).toEqual([]);
    expect(supabaseOrigins("javascript:alert(1)")).toEqual([]);
  });
});
