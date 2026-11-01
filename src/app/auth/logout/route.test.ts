import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ auth: { signOut: m.signOut } })) }));

import { NextRequest } from "next/server";
import { POST } from "./route";

beforeEach(() => { vi.clearAllMocks(); m.signOut.mockResolvedValue({ error: null }); });

it("signs out only this browser, so the same account stays signed in on the other devices", async () => {
  const body = new FormData(); body.set("surface", "work");
  const response = await POST(new NextRequest("https://app.example.test/auth/logout", { method: "POST", body }));
  expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://app.example.test/?portal=work");
});
