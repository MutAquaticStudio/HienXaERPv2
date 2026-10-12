import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: mocks.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: mocks.rpc })) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
import { activateOperations } from "./actions";
beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue({ branchId: "branch" }); });
describe("retired activation action", () => {
 it.each(["ACTIVATE:branch:2", "incorrect", ""])("legacy request %s redirects without a write or success claim", async confirmation => {
  const form = new FormData(); form.set("confirmation", confirmation);
  await expect(activateOperations(form)).rejects.toThrow("REDIRECT:/admin/operations");
  expect(mocks.access).toHaveBeenCalledOnce(); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("authentication and branch access remain required", async () => {
  mocks.access.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(activateOperations(new FormData())).rejects.toThrow("FORBIDDEN");
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
