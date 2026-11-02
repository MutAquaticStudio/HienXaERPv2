import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));
import { GET } from "./route";

const call = (query: string) => GET(new Request(`https://app.hienxavlxd.com/api/zalo/oauth/callback${query}`));
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: "CONNECTED", error: null }); });

it("exchanges the code in the database and returns to Cài đặt → Zalo OA", async () => {
  const response = await call("?code=abc&state=st&oa_id=999");
  expect(m.rpc).toHaveBeenCalledWith("complete_zalo_oauth", { code: "abc", state_token: "st", target_oa_id: "999" });
  expect(response.headers.get("location")).toBe("https://app.hienxavlxd.com/admin/settings/zalo?notice=connected");
});

it("explains a refused or missing code without showing technical codes", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "zalo_oauth_state_invalid" } });
  const refused = new URL((await call("?code=abc&state=old")).headers.get("location")!);
  expect(refused.searchParams.get("error")).toContain("Phiên kết nối đã hết hạn");
  const missing = new URL((await call("?state=old")).headers.get("location")!);
  expect(missing.searchParams.get("error")).toContain("Zalo không trả mã");
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
