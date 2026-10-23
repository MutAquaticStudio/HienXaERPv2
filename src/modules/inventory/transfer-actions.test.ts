import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "row" }, error: null }) };
  return { from: () => query, rpc: m.rpc };
}) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { createWarehouseTransferAction, createWarehouseTransfersAction, quickTransferStepAction, recordWarehouseTransferAction } from "./transfer-actions";
import { transferStatus } from "./transfer-presentation";

const ids = { from: "11111111-1111-4111-8111-111111111111", to: "22222222-2222-4222-8222-222222222222", material: "33333333-3333-4333-8333-333333333333",
  op: "44444444-4444-4444-8444-444444444444", transfer: "55555555-5555-4555-8555-555555555555" };
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: "done", error: null }); });

it("opens a transfer without a note and records a plain description (FB7)", async () => {
  expect(await createWarehouseTransferAction(form({ fromWarehouseId: ids.from, toWarehouseId: ids.to, materialId: ids.material, quantity: "1.5", reason: "", operationId: ids.op })))
    .toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("create_warehouse_transfer", expect.objectContaining({ planned_base_quantity: "1.5", transfer_reason: "Chuyển kho" }));
});

it("records a transfer event without a note, keeping the event name as the note (FB7)", async () => {
  expect(await recordWarehouseTransferAction(form({ transferId: ids.transfer, kind: "DISPATCH", dispatchId: "", issueId: "", quantity: "1", version: "2", operationId: ids.op })))
    .toMatchObject({ status: "SUCCESS" });
  expect(m.rpc).toHaveBeenCalledWith("record_warehouse_transfer_event", expect.objectContaining({ event_kind: "DISPATCH", event_reason: "Xuất kho" }));
  await recordWarehouseTransferAction(form({ transferId: ids.transfer, kind: "RECEIVE", dispatchId: ids.op, issueId: "", quantity: "1", version: "2", operationId: ids.op, reason: "Xe về muộn" }));
  expect(m.rpc).toHaveBeenLastCalledWith("record_warehouse_transfer_event", expect.objectContaining({ event_reason: "Xe về muộn" }));
});

it("creates several transfer lines at once with their units and ships them (FB10)", async () => {
  const data = form({ fromWarehouseId: ids.from, toWarehouseId: ids.to, shipNow: "1", note: "", operationId: ids.op });
  data.append("materialId", ids.material); data.append("uomId", ids.transfer); data.append("quantity", "4");
  expect(await createWarehouseTransfersAction(data)).toMatchObject({ status: "SUCCESS", message: "Đã tạo phiếu chuyển và xuất kho." });
  expect(m.rpc).toHaveBeenCalledWith("create_warehouse_transfers", { target_branch_id: "branch-a", from_warehouse_id: ids.from, to_warehouse_id: ids.to,
    transfer_lines: [{ material_id: ids.material, uom_id: ids.transfer, quantity: "4" }], ship_now: true, transfer_note: "", operation_id: ids.op });
  const same = form({ fromWarehouseId: ids.from, toWarehouseId: ids.from, note: "", operationId: ids.op });
  expect(await createWarehouseTransfersAction(same)).toMatchObject({ status: "FAILED", message: "Chọn kho chuyển và kho nhận khác nhau." });
});

it("receives everything on the way in one tap", async () => {
  await expect(quickTransferStepAction(form({ transferId: ids.transfer, step: "RECEIVE_ALL", operationId: ids.op }))).rejects.toThrow("notice=received");
  expect(m.rpc).toHaveBeenCalledWith("quick_warehouse_transfer_step", { target_transfer_id: ids.transfer, step: "RECEIVE_ALL", operation_id: ids.op });
  m.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "transfer_nothing_to_receive" } });
  await expect(quickTransferStepAction(form({ transferId: ids.transfer, step: "RECEIVE_ALL", operationId: ids.op }))).rejects.toThrow(encodeURIComponent("Không còn hàng đang chuyển để nhận."));
});

it("labels a transfer by what it waits for", () => {
  const base = { planned_base_quantity: "10", shipped_base_quantity: "0", received_base_quantity: "0", in_transit_base_quantity: "0", transfer_state: "OPEN", dispatch_closed: false };
  expect(transferStatus(base)).toMatchObject({ label: "Phiếu tạm", step: "DISPATCH_ALL" });
  expect(transferStatus({ ...base, shipped_base_quantity: "10", in_transit_base_quantity: "10", transfer_state: "IN_PROGRESS" })).toMatchObject({ label: "Đang chuyển", step: "RECEIVE_ALL" });
  expect(transferStatus({ ...base, transfer_state: "CLOSED" })).toMatchObject({ label: "Đã nhận", step: null });
});
