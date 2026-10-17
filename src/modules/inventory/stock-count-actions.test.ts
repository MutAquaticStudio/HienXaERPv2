import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { cancelStockCountAction, saveStockCountSheetAction } from "./stock-count-actions";

const ids = { op: "11111111-1111-4111-8111-111111111111", count: "22222222-2222-4222-8222-222222222222", material: "33333333-3333-4333-8333-333333333333",
  other: "44444444-4444-4444-8444-444444444444", approve: "55555555-5555-4555-8555-555555555555" };
const line = { materialId: ids.material, counted: "98", reason: "Hao hụt", unitCost: null };
const base = { operationId: ids.op, stockCountId: ids.count, version: 3, lines: [line], approveOperationId: null };
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ branchId: "b", permissions: new Set() });
  m.rpc.mockImplementation(async (name: string) => name === "record_stock_count_lines_batch" ? { data: { version: 4 }, error: null } : { data: ids.count, error: null });
});

it("saves the changed lines in one batch command", async () => {
  expect(await saveStockCountSheetAction(base)).toMatchObject({ status: "SUCCESS", version: 4 });
  expect(m.access).toHaveBeenCalledWith("inventory.count");
  expect(m.rpc).toHaveBeenCalledWith("record_stock_count_lines_batch", {
    target_stock_count_id: ids.count,
    count_lines: [{ material_id: ids.material, counted_base_quantity: "98", adjustment_unit_cost_vnd: null, reason: "Hao hụt" }],
    expected_count_version: 3,
    operation_id: ids.op,
  });
  expect(m.rpc).toHaveBeenCalledTimes(1);
});

it("completes the count on the version the batch left", async () => {
  expect(await saveStockCountSheetAction({ ...base, approveOperationId: ids.approve })).toMatchObject({ status: "SUCCESS", approved: true });
  expect(m.access).toHaveBeenCalledWith("inventory.adjust");
  expect(m.rpc).toHaveBeenLastCalledWith("approve_stock_count", { target_stock_count_id: ids.count, expected_count_version: 4, operation_id: ids.approve });
  m.rpc.mockClear();
  expect(await saveStockCountSheetAction({ ...base, lines: [], approveOperationId: ids.approve })).toMatchObject({ status: "SUCCESS", approved: true });
  expect(m.rpc).toHaveBeenCalledTimes(1);
  expect(m.rpc).toHaveBeenCalledWith("approve_stock_count", { target_stock_count_id: ids.count, expected_count_version: 3, operation_id: ids.approve });
});

it("checks the sheet before calling the database", async () => {
  expect((await saveStockCountSheetAction({ ...base, lines: [] })).message).toBe("Chưa có số đếm mới để lưu.");
  expect((await saveStockCountSheetAction({ ...base, lines: [{ ...line, counted: "-1" }] })).status).toBe("FAILED");
  expect((await saveStockCountSheetAction({ ...base, lines: [line, { ...line, counted: "2" }] })).message).toContain("hai lần");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("tells a saved sheet whose approval was refused apart from an unknown outcome", async () => {
  m.rpc.mockImplementation(async (name: string) => name === "record_stock_count_lines_batch"
    ? { data: { version: 4 }, error: null } : { data: null, error: { code: "23514", message: "stock_count_adjustment_below_reserved_or_on_hand" } });
  const refused = await saveStockCountSheetAction({ ...base, approveOperationId: ids.approve });
  expect(refused).toMatchObject({ status: "FAILED", version: 4 });
  expect(refused.message).toMatch(/^Đã lưu số đếm nhưng chưa cân bằng kho: Chưa thể duyệt/);
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "variance_reason_required" } });
  expect(await saveStockCountSheetAction(base)).toEqual({ status: "FAILED", message: "Dòng có chênh lệch cần lý do (ít nhất 3 ký tự)." });
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  expect((await saveStockCountSheetAction(base)).status).toBe("UNKNOWN");
  m.rpc.mockRejectedValueOnce(new Error("socket hang up"));
  expect((await saveStockCountSheetAction(base)).status).toBe("UNKNOWN");
});

it("cancels with a reason and nothing else", async () => {
  expect((await cancelStockCountAction({ operationId: ids.op, stockCountId: ids.count, version: 3, reason: " " })).status).toBe("FAILED");
  expect(m.rpc).not.toHaveBeenCalled();
  expect(await cancelStockCountAction({ operationId: ids.op, stockCountId: ids.count, version: 3, reason: "Đếm nhầm kho" })).toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("cancel_stock_count", { target_stock_count_id: ids.count, expected_count_version: 3, cancel_reason: "Đếm nhầm kho", operation_id: ids.op });
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "stock_count_version_conflict" } });
  expect((await cancelStockCountAction({ operationId: ids.op, stockCountId: ids.count, version: 3, reason: "Đếm nhầm kho" })).message).toContain("đã thay đổi");
});
