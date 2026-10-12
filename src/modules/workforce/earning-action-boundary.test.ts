import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), permission: vi.fn(), invalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.invalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error("REDIRECT:" + url); } }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mock.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: mock.rpc }) }));
import { calculateEarningAction, cancelScheduledServiceJobAction } from "./actions";
const id = "10000000-0000-4000-8000-000000000001";
function form(values: Record<string,string>) { const data = new FormData(); for (const [key,value] of Object.entries(values)) data.set(key,value); return data; }
beforeEach(() => { vi.clearAllMocks(); mock.permission.mockResolvedValue({ branchId: id }); });
describe("earning calculation boundary", () => {
  it.each(["23505", "PT409", "XX000"])("maps %s without exposing SQL/constraint details", async code => {
    mock.rpc.mockResolvedValue({ error: { code, message: "raw SQL secret_constraint_name" } });
    let message = ""; try { await calculateEarningAction(form({ ruleId: id, sourceKind: "WORK_ITEM_VERIFICATION", sourceId: id, returnTo: "/admin/compensation", operationId: id })); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("REDIRECT:/admin/compensation?error="); expect(decodeURIComponent(message)).not.toMatch(/raw SQL|secret_constraint_name/);
    expect(mock.rpc).toHaveBeenCalledWith("calculate_earning_event", expect.objectContaining({ source_id: id }));
  });
  it("keeps cancellation error handling unrelated to earning messages", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "55000", message: "service_not_cancelable" } });
    let redirect = "";
    try { await cancelScheduledServiceJobAction(form({ serviceJobId: id, version: "1", reason: "controlled cancellation", operationId: id })); } catch (error) { redirect = decodeURIComponent((error as Error).message); }
    expect(redirect).toContain("Không thể hủy lịch dịch vụ vì đã phát sinh công việc hoặc kết quả xác minh.");
    expect(redirect).not.toMatch(/service_not_cancelable|thu nhập/);
    expect(mock.invalidate).not.toHaveBeenCalled();
  });
});
