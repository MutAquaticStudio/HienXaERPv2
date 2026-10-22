import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { revokeCustomerPortalAccessAction } from "./portal-account-actions";

const ids = { customer: "11111111-1111-4111-8111-111111111111", membership: "22222222-2222-4222-8222-222222222222" };
const form = (reason?: string) => { const data = new FormData(); data.set("customerId", ids.customer); data.set("membershipId", ids.membership); if (reason !== undefined) data.set("reason", reason); return data; };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: null, error: null }); });

it("revokes a customer login without a note and records a plain description (FB7)", async () => {
  expect(await revokeCustomerPortalAccessAction(undefined, form())).toMatchObject({ success: true });
  expect(m.rpc).toHaveBeenCalledWith("revoke_customer_portal_access", expect.objectContaining({ target_membership_id: ids.membership, reason: "Thu hồi tài khoản cổng khách" }));
  await revokeCustomerPortalAccessAction(undefined, form("Khách đổi kế toán"));
  expect(m.rpc).toHaveBeenLastCalledWith("revoke_customer_portal_access", expect.objectContaining({ reason: "Khách đổi kế toán" }));
});
