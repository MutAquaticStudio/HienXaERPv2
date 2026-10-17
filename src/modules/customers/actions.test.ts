import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/modules/portal/server", () => ({ portalRpc: mocks.rpc }));

import { createCustomerQuickAction } from "./actions";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
beforeEach(() => { mocks.rpc.mockReset(); mocks.rpc.mockResolvedValue({}); });

it("stores a quick customer code in upper case", async () => {
  const result = await createCustomerQuickAction(undefined, form({ code: " kh-01 ", name: "Anh Tư", phone: "" }));
  expect(result).toMatchObject({ success: true, name: "Anh Tư" });
  expect(mocks.rpc).toHaveBeenCalledWith(expect.anything(), "save_customer_site_profile", expect.objectContaining({
    values_json: expect.objectContaining({ code: "KH-01", display_name: "Anh Tư" }) }));
});

it("explains the code format instead of a generic error", async () => {
  const result = await createCustomerQuickAction(undefined, form({ code: "khách 1", name: "Anh Tư" }));
  expect(result.success).toBe(false);
  expect(result.message).toContain("chữ không dấu");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
