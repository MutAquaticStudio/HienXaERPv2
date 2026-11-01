import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn(), rows: [] as Record<string, unknown>[], options: vi.fn(), calls: [] as { table: string; select: string; eq: unknown[][] }[] }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("./editor-data", () => ({ loadCatalogOptions: m.options }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({
  rpc: m.rpc,
  from(table: string) {
    const call = { table, select: "", eq: [] as unknown[][] };
    m.calls.push(call);
    const chain = {
      select(columns: string) { call.select = columns; return chain; },
      in() { return chain; },
      eq(...args: unknown[]) { call.eq.push(args); return chain; },
      order() { return chain; },
      limit: async () => ({ data: m.rows, error: null }),
    };
    return chain;
  },
})) }));

import { bulkCatalogAction } from "./bulk-actions";
import { bulkConfirmText, bulkSummary } from "./bulk";

const id = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`;
beforeEach(() => {
  vi.clearAllMocks();
  m.calls = [];
  m.access.mockResolvedValue({ authUserId: "u", branchId: "branch-a", permissions: new Set(["customers.manage", "pricing.manage", "catalog.manage", "suppliers.manage"]) });
  m.rpc.mockResolvedValue({ data: "ok", error: null });
  m.options.mockResolvedValue({ priceGroups: [{ id: "SI", name: "Sỉ", assignable: true }, { id: "OLD", name: "Cũ (ngừng)", assignable: false }], groups: [{ id: id(9), name: "Cát" }] });
});

describe("bulk catalog changes", () => {
  it("sets a customer's price group one record at a time through the audited profile command, skipping those already set", async () => {
    m.rows = [{ id: id(1), code: "KH001", tier_code: null }, { id: id(2), code: "KH002", tier_code: "SI" }];
    const result = await bulkCatalogAction({ kind: "customers", ids: [id(1), id(2)], operation: { type: "set", field: "tier_code", value: "SI" } });
    expect(result).toMatchObject({ status: "SUCCESS", changed: 1, unchanged: 1, failed: [] });
    expect(result.message).toBe("Đã cập nhật 1 khách hàng; 1 khách hàng đã đúng sẵn, không cần đổi.");
    expect(m.access).toHaveBeenCalledWith("customers.manage");
    expect(m.calls[0]).toMatchObject({ table: "customers", select: "id,code,tier_code", eq: [["branch_id", "branch-a"]] });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("save_customer_site_profile", expect.objectContaining({ kind: "customers", target_id: id(1), target_branch_id: "branch-a",
      values_json: { tier_code: "SI" }, expected_json: { tier_code: null }, change_reason: "Sửa hàng loạt" }));
  });

  it("refuses a stopped or unknown choice, a field outside the list and a price group without pricing permission", async () => {
    m.rows = [{ id: id(1), code: "KH001", tier_code: null }];
    expect((await bulkCatalogAction({ kind: "customers", ids: [id(1)], operation: { type: "set", field: "tier_code", value: "OLD" } })).status).toBe("FAILED");
    expect((await bulkCatalogAction({ kind: "customers", ids: [id(1)], operation: { type: "set", field: "credit_limit_vnd", value: "1" } })).message).toBe("Không sửa hàng loạt được trường này.");
    expect((await bulkCatalogAction({ kind: "customers", ids: [id(1)], operation: { type: "set", field: "payment_terms_days", value: "400" } })).message).toContain("0 đến 365");
    m.access.mockResolvedValue({ authUserId: "u", branchId: "branch-a", permissions: new Set(["customers.manage"]) });
    expect((await bulkCatalogAction({ kind: "customers", ids: [id(1)], operation: { type: "set", field: "tier_code", value: "SI" } })).message).toContain("không có quyền");
    expect((await bulkCatalogAction({ kind: "customers", ids: [], operation: { type: "delete" } })).status).toBe("FAILED");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("clears the price group back to the general book with an empty choice", async () => {
    m.rows = [{ id: id(1), code: "KH001", tier_code: "SI" }];
    await bulkCatalogAction({ kind: "customers", ids: [id(1)], operation: { type: "set", field: "tier_code", value: "" } });
    expect(m.rpc).toHaveBeenCalledWith("save_customer_site_profile", expect.objectContaining({ values_json: { tier_code: null }, expected_json: { tier_code: "SI" } }));
  });

  it("deletes what it can and names each record it could not, in Vietnamese", async () => {
    m.rows = [{ id: id(1), code: "NCC1", active: true }, { id: id(2), code: "NCC2", active: true }, { id: id(3), code: "NCC3", active: true }];
    m.rpc.mockResolvedValueOnce({ data: "ok", error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "23503", message: "catalog_record_in_use" } })
      .mockRejectedValueOnce(new Error("fetch failed"));
    const result = await bulkCatalogAction({ kind: "suppliers", ids: [id(1), id(2), id(3)], operation: { type: "delete" } });
    expect(result.status).toBe("PARTIAL");
    expect(result.message).toBe("Đã xóa 1 nhà cung cấp; 2 nhà cung cấp không thực hiện được.");
    expect(result.failed).toEqual([{ code: "NCC2", reason: expect.stringContaining("đã có chứng từ") }, { code: "NCC3", reason: expect.stringContaining("chưa rõ kết quả") }]);
    expect(m.rpc).toHaveBeenNthCalledWith(1, "delete_catalog_record", expect.objectContaining({ kind: "suppliers", target_id: id(1), change_reason: "Sửa hàng loạt" }));
  });

  it("stops and restarts records with the active flag and keeps a material sold or bought", async () => {
    m.rows = [{ id: id(1), code: "VT1", active: true }, { id: id(2), code: "VT2", active: false }];
    expect(await bulkCatalogAction({ kind: "materials", ids: [id(1), id(2)], operation: { type: "active", active: false } })).toMatchObject({ changed: 1, unchanged: 1 });
    expect(m.rpc).toHaveBeenCalledWith("save_catalog_record", expect.objectContaining({ values_json: { active: false }, expected_json: { active: true } }));
    m.rpc.mockClear();
    m.rows = [{ id: id(1), code: "VT1", sale_enabled: true, purchase_enabled: false }, { id: id(2), code: "VT2", sale_enabled: true, purchase_enabled: true }];
    const result = await bulkCatalogAction({ kind: "materials", ids: [id(1), id(2)], operation: { type: "set", field: "sale_enabled", value: false } });
    expect(result.failed).toEqual([{ code: "VT1", reason: "vật tư phải cho phép bán hoặc mua" }]);
    expect(m.rpc).toHaveBeenCalledTimes(1);
    // Materials are shared by every branch.
    expect(m.calls.at(-1)?.eq).toEqual([]);
  });

  it("reports a record changed by someone else without touching the rest", async () => {
    m.rows = [{ id: id(1), code: "KH001", payment_terms_days: 0 }, { id: id(2), code: "KH002", payment_terms_days: 7 }];
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "master_expected_mismatch" } });
    const result = await bulkCatalogAction({ kind: "customers", ids: [id(1), id(2)], operation: { type: "set", field: "payment_terms_days", value: "30" } });
    expect(result).toMatchObject({ status: "PARTIAL", changed: 1, failed: [{ code: "KH001", reason: expect.stringContaining("người khác sửa") }] });
    expect(m.rpc).toHaveBeenLastCalledWith("save_customer_site_profile", expect.objectContaining({ values_json: { payment_terms_days: "30" }, expected_json: { payment_terms_days: 7 } }));
  });
});

describe("bulk wording", () => {
  it("asks before running and summarises in plain Vietnamese", () => {
    expect(bulkConfirmText("customers", { type: "set", field: "tier_code", value: "SI" }, 12, "Sỉ")).toBe("Đổi Nhóm giá của 12 khách hàng thành “Sỉ”?");
    expect(bulkConfirmText("materials", { type: "delete" }, 3)).toContain("Xóa hẳn 3 vật tư?");
    expect(bulkSummary("suppliers", { type: "active", active: false }, 0, 0, [{ code: "A", reason: "x" }]).status).toBe("FAILED");
  });
});
