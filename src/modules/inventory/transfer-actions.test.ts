import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: vi.fn(async () => ({ branchId: "branch-a" })) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ checkSavedCommandFieldsAction: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id: "row" }, error: null }) };
  return { from: () => query, rpc: m.rpc };
}) }));
import { createWarehouseTransferAction, recordWarehouseTransferAction } from "./transfer-actions";

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
  expect(m.rpc).toHaveBeenCalledWith("record_warehouse_transfer_event", expect.objectContaining({ event_kind: "DISPATCH", event_reason: "Xuất thực tế" }));
  await recordWarehouseTransferAction(form({ transferId: ids.transfer, kind: "RECEIVE", dispatchId: ids.op, issueId: "", quantity: "1", version: "2", operationId: ids.op, reason: "Xe về muộn" }));
  expect(m.rpc).toHaveBeenLastCalledWith("record_warehouse_transfer_event", expect.objectContaining({ event_reason: "Xe về muộn" }));
});
