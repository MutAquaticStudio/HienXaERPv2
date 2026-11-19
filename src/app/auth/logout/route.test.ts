import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ signOut: vi.fn(), rpc: vi.fn(), order: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ auth: { signOut: m.signOut }, rpc: m.rpc })) }));

import { NextRequest } from "next/server";
import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  m.order = [];
  m.signOut.mockImplementation(async () => { m.order.push("signOut"); return { error: null }; });
  m.rpc.mockImplementation(async (name: string) => { m.order.push(name); return { data: null, error: null }; });
});

it("signs out only this browser, so the same account stays signed in on the other devices", async () => {
  const body = new FormData(); body.set("surface", "work");
  const response = await POST(new NextRequest("https://app.example.test/auth/logout", { method: "POST", body }));
  expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(m.rpc).not.toHaveBeenCalled();
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://app.example.test/?portal=work");
});

it("D86: signed out in the Android app, the phone's push token leaves the login before the session ends", async () => {
  const token = "fcmLogoutToken:APA91b" + "q".repeat(60);
  const body = new FormData(); body.set("surface", "customer"); body.set("push_token", token);
  const response = await POST(new NextRequest("https://app.example.test/auth/logout", { method: "POST", body }));
  expect(m.rpc).toHaveBeenCalledWith("delete_app_push_token", { token });
  expect(m.order).toEqual(["delete_app_push_token", "signOut"]);
  expect(response.headers.get("location")).toBe("https://app.example.test/?portal=customer");

  // Something that is not a token is ignored; a database error never blocks the sign-out.
  vi.clearAllMocks();
  const junk = new FormData(); junk.set("push_token", "<script>");
  await POST(new NextRequest("https://app.example.test/auth/logout", { method: "POST", body: junk }));
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockRejectedValueOnce(new Error("network"));
  const again = await POST(new NextRequest("https://app.example.test/auth/logout", { method: "POST", body }));
  expect(m.signOut).toHaveBeenCalledTimes(2);
  expect(again.status).toBe(303);
});

it("D97 (G-6): a sign-out posted by another site is refused and the session stays", async () => {
  const response = await POST(new NextRequest("https://app.example.test/auth/logout", { method: "POST",
    headers: { host: "app.example.test", origin: "https://shop.example.test" } }));
  expect(response.status).toBe(403);
  expect(m.signOut).not.toHaveBeenCalled();
  const same = await POST(new NextRequest("https://app.example.test/auth/logout", { method: "POST",
    headers: { host: "app.example.test", origin: "https://app.example.test" } }));
  expect(same.status).toBe(303);
  expect(m.signOut).toHaveBeenCalledTimes(1);
});
