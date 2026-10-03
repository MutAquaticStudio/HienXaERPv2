import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const ref = "ffrwiglcrlumfvhubaxg";
const commit = "6f765ad7c3389be0ec43c3bec79ad10859d3da74";
const fingerprint = "7".repeat(64);

beforeEach(() => {
  vi.stubEnv("HX_QA_PROJECT_REF", ref);
  vi.stubEnv("HX_QA_RUNTIME_APPROVED", "true");
  vi.stubEnv("HX_CLOUD_RUNTIME_APPROVED", "true");
  vi.stubEnv("HX_EINVOICE_ENABLED", "false");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${ref}.supabase.co`);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "qa-test-key");
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
  vi.stubEnv("HX_QA_BUILD_SHA", commit);
  vi.stubEnv("HX_QA_CANDIDATE_FINGERPRINT", fingerprint);
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});
afterEach(() => vi.unstubAllEnvs());

describe("QA-only browser candidate identity", () => {
  it("is absent outside QA", () => {
    vi.stubEnv("HX_QA_PROJECT_REF", "");
    expect(GET().status).toBe(404);
  });
  it("does not activate without explicit QA approval", () => {
    vi.stubEnv("HX_QA_RUNTIME_APPROVED", "false");
    expect(GET().status).toBe(404);
  });
  it("fails closed when the candidate fingerprint is not pinned", () => {
    vi.stubEnv("HX_QA_CANDIDATE_FINGERPRINT", "");
    expect(GET().status).toBe(503);
  });
  it("renders only validated identity values with private no-store HTML", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.text();
    expect(body).toContain(commit);
    expect(body).toContain(fingerprint);
    expect(body).toContain(ref);
    expect(body).not.toContain("qa-test-key");
  });
  it("rejects non-hex build metadata instead of rendering it", () => {
    vi.stubEnv("HX_QA_BUILD_SHA", "<script>alert(1)</script>");
    expect(GET().status).toBe(503);
  });
  it("retains the existing production-project guard", () => {
    vi.stubEnv("HX_QA_PROJECT_REF", "nbwynrwkdbtfsitafsxa");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://nbwynrwkdbtfsitafsxa.supabase.co");
    expect(() => GET()).toThrow("QA runtime does not match the approved QA project.");
  });
});
