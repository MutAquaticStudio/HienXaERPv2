import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { deleteCatalogRecordAction, setCatalogActiveAction } from "./actions";

const ids = { op: "11111111-1111-4111-8111-111111111111", record: "22222222-2222-4222-8222-222222222222", customer: "33333333-3333-4333-8333-333333333333" };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "branch-a", permissions: new Set(["catalog.manage", "customers.manage"]) }); m.rpc.mockResolvedValue({ data: ids.record, error: null }); });

it("stops a record through the audited save command, changing only its status", async () => {
  const result = await setCatalogActiveAction({ kind: "materials", id: ids.record, active: false, operationId: ids.op });
  expect(result).toMatchObject({ status: "SUCCESS", resultId: ids.record });
  expect(m.access).toHaveBeenCalledWith("catalog.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_catalog_record", { kind: "materials", target_id: ids.record, target_branch_id: "branch-a",
    values_json: { active: false }, expected_json: { active: true }, change_reason: "Ngừng sử dụng", operation_id: ids.op });
});

it("keeps a site's customer in the change and uses the customer profile command", async () => {
  await setCatalogActiveAction({ kind: "sites", id: ids.record, active: true, customerId: ids.customer, operationId: ids.op });
  expect(m.rpc).toHaveBeenCalledWith("save_customer_site_profile", expect.objectContaining({ kind: "sites",
    values_json: { customer_id: ids.customer, active: true }, expected_json: { customer_id: ids.customer, active: false }, change_reason: "Dùng lại" }));
  expect((await setCatalogActiveAction({ kind: "sites", id: ids.record, active: true, operationId: ids.op })).status).toBe("FAILED");
});

it("deletes an unused record and explains in Vietnamese when it is in use", async () => {
  expect(await deleteCatalogRecordAction({ kind: "customers", id: ids.record, operationId: ids.op })).toMatchObject({ status: "SUCCESS", message: "Đã xóa khách hàng." });
  expect(m.rpc).toHaveBeenCalledWith("delete_catalog_record", { kind: "customers", target_id: ids.record, target_branch_id: "branch-a",
    change_reason: "Xóa khỏi danh mục", operation_id: ids.op });
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "23503", message: "catalog_record_in_use" } });
  const used = await deleteCatalogRecordAction({ kind: "customers", id: ids.record, operationId: ids.op });
  expect(used).toMatchObject({ status: "FAILED", inUse: true });
  expect(used.message).toContain("không xóa được");
  expect(used.message).not.toContain("catalog_record_in_use");
});

it("treats a lost connection as unknown, not as a failure, and refuses branches", async () => {
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  expect((await deleteCatalogRecordAction({ kind: "materials", id: ids.record, operationId: ids.op })).status).toBe("UNKNOWN");
  expect((await deleteCatalogRecordAction({ kind: "branches", id: ids.record, operationId: ids.op })).status).toBe("FAILED");
  expect((await deleteCatalogRecordAction({ kind: "materials", id: "not-a-uuid", operationId: ids.op })).status).toBe("FAILED");
});
