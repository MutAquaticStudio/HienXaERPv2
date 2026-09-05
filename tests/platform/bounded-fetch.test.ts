import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedSupabaseFetch } from "@/lib/supabase/bounded-fetch";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Supabase HTTP read deadline", () => {
  it("preserves status and payload without logging filters or credentials", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"denied"}', { status: 403 })));
    const response = await boundedSupabaseFetch("https://example.test/rest/v1/customers?email=eq.private@example.test", { headers: { authorization: "secret-token" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "denied" });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private@example");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");
  });

  it("keeps the timeout active after headers while waiting for the body", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    let aborted = false;
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => ({
      arrayBuffer: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); });
      }),
    })));
    const result = boundedSupabaseFetch("https://example.test/rest/v1/customers");
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
