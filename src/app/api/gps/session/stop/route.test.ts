import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));

import { POST } from "./route";

const request = () => new Request("http://localhost/api/gps/session/stop", { method: "POST", body: JSON.stringify({ sessionId: "s1", operationId: "o1" }) });
beforeEach(() => vi.clearAllMocks());

it("does not send a raw database message to the browser", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "gps_session_not_found for worker 1234" } });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "Không thể dừng chia sẻ vị trí." });
});

it("keeps a Vietnamese message and answers 403 for a permission refusal", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Bạn không có quyền dừng phiên này." } });
  const response = await POST(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Bạn không có quyền dừng phiên này." });
});
