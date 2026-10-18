import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permission: vi.fn(), client: vi.fn(), rpc: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission, requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
import { createSalesOrderAction, previewCommercialDocumentAction } from "./actions";
import { derivedOperationId } from "./auto-sourcing";

const customer = "11111111-1111-4111-8111-111111111111", site = "22222222-2222-4222-8222-222222222222", material = "33333333-3333-4333-8333-333333333333";
const uom = "44444444-4444-4444-8444-444444444444", rule = "55555555-5555-4555-8555-555555555555", order = "66666666-6666-4666-8666-666666666666";
const draftOperation = "77777777-7777-4777-8777-777777777777", confirmOperation = "88888888-8888-4888-8888-888888888888";

function fixture(permissions: string[]) {
  m.permission.mockResolvedValue({ branchId: "branch", permissions: new Set(permissions) });
  m.client.mockResolvedValue({ rpc: m.rpc, from: (table: string) => {
    const result = { data: table === "customers" ? { id: customer, tier_code: null } : table === "customer_sites" ? { id: site }
      : table === "materials" ? [{ id: material, group_id: "g", base_uom_id: uom }]
      : table === "pricing_rules" ? [{ id: rule, branch_id: "branch", scope_type: "DEFAULT", material_id: material, price_uom_id: uom, unit_price_vnd: "150000", version: 1, source_type: "LIST", effective_from: "2020-01-01T00:00:00Z", effective_to: null, active: true }] : [], error: null };
    const q = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), lte: vi.fn(), or: vi.fn(), order: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result), then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    for (const key of ["select", "eq", "in", "lte", "or", "order"] as const) q[key].mockReturnValue(q);
    return q;
  } });
}

async function form(intent: "confirm" | "draft", confirmId = confirmOperation) {
  const preview = await previewCommercialDocumentAction({ kind: "order", customerId: customer, siteId: site, lines: [{ materialId: material, orderedUomId: uom, quantity: "2" }] });
  const data = new FormData();
  for (const [key, value] of Object.entries({ customerId: customer, siteId: site, materialId: material, orderedUomId: uom, quantity: "2", manualPriceVnd: "", manualReason: "", sourceLineId: "",
    effectiveAt: "", terms: "", operationId: draftOperation, confirmOperationId: confirmId, intent, pricePreview: JSON.stringify(preview.lines) })) data.set(key, value);
  return data;
}
async function redirectOf(data: FormData) {
  await expect(createSalesOrderAction(undefined, data)).rejects.toThrow("NEXT_REDIRECT");
  return String(m.redirect.mock.lastCall![0]);
}
const rpcNames = () => m.rpc.mock.calls.map((call) => call[0]);

beforeEach(() => {
  vi.resetAllMocks();
  m.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  m.rpc.mockResolvedValue({ data: order, error: null });
});

it("creates the draft then confirms it, each with its own operation ID", async () => {
  fixture(["orders.create", "orders.confirm"]);
  expect(await redirectOf(await form("confirm"))).toBe(`/admin/orders/${order}?notice=confirmed-sourced`);
  // D19: the confirmed order is then sourced with an operation derived from the confirmation (retry = same sourcing).
  expect(rpcNames()).toEqual(["create_sales_order_draft", "confirm_sales_order", "auto_source_sales_order"]);
  expect(m.rpc.mock.calls[0][1]).toMatchObject({ operation_id: draftOperation });
  expect(m.rpc.mock.calls[1][1]).toEqual({ target_order_id: order, operation_id: confirmOperation });
  expect(m.rpc.mock.calls[2][1]).toEqual({ target_sales_order_id: order, operation_id: derivedOperationId(confirmOperation, "auto-source") });
  expect(derivedOperationId(confirmOperation, "auto-source")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

it("stays confirmed when sourcing fails or is switched off for the branch", async () => {
  fixture(["orders.create", "orders.confirm"]);
  m.rpc.mockImplementation(async (name: string) => name === "auto_source_sales_order" ? { data: null, error: { code: "23514", message: "x" } } : { data: order, error: null });
  expect(await redirectOf(await form("confirm"))).toBe(`/admin/orders/${order}?notice=confirmed-unsourced`);
});

it("keeps the saved draft and explains in Vietnamese when confirmation is rejected", async () => {
  fixture(["orders.create", "orders.confirm"]);
  m.rpc.mockImplementation(async (name: string) => name === "confirm_sales_order"
    ? { data: null, error: { message: "credit_limit_exceeded" } } : { data: order, error: null });
  const target = new URL(await redirectOf(await form("confirm")), "http://localhost");
  expect(target.pathname).toBe(`/admin/orders/${order}`);
  expect(target.searchParams.get("error")).toBe("Đã lưu bản nháp nhưng chưa xác nhận được: Hạn mức tín dụng không đủ để xác nhận đơn.");
});

it("refuses to create anything when the actor cannot confirm", async () => {
  fixture(["orders.create"]);
  await expect(createSalesOrderAction(undefined, await form("confirm"))).resolves.toEqual({ message: "Bạn không có quyền xác nhận đơn bán. Hãy chọn Lưu nháp." });
  expect(m.rpc).not.toHaveBeenCalled();
});

it("rejects a confirm operation ID that reuses the draft operation ID", async () => {
  fixture(["orders.create", "orders.confirm"]);
  const result = await createSalesOrderAction(undefined, await form("confirm", draftOperation));
  expect(result?.message).toContain("Thông tin xác nhận đơn chưa hợp lệ");
  expect(m.rpc).not.toHaveBeenCalled();
});

it("'Lưu nháp' only saves the draft", async () => {
  fixture(["orders.create", "orders.confirm"]);
  expect(await redirectOf(await form("draft"))).toBe(`/admin/orders/${order}?notice=created`);
  expect(rpcNames()).toEqual(["create_sales_order_draft"]);
});

it("sends line and order discounts to the database as per-unit discounts on the price list price", async () => {
  fixture(["orders.create", "pricing.manage"]);
  const data = await form("draft");
  data.set("discountMode", "PERCENT"); data.set("discountValue", "2,5");
  data.set("orderDiscountMode", "AMOUNT"); data.set("orderDiscountValue", "10.000");
  expect(await redirectOf(data)).toBe(`/admin/orders/${order}?notice=created`);
  const payload = m.rpc.mock.calls[0][1];
  // 150.000 − 2,5 % = 146.250 a unit; the 10.000 order discount adds 5.000 a unit on 2 units.
  expect(payload.order_lines).toEqual([expect.objectContaining({ unit_price_vnd: "150000", discount_unit_vnd: "8750", discount_mode: "PERCENT", discount_value: "2.5" })]);
  expect(payload.order_discount).toEqual({ mode: "AMOUNT", value: "10000" });
});

it("keeps a payload without discounts exactly as before and refuses discounts without pricing rights", async () => {
  fixture(["orders.create"]);
  await redirectOf(await form("draft"));
  expect(m.rpc.mock.calls[0][1]).not.toHaveProperty("order_discount");
  expect(Object.keys(m.rpc.mock.calls[0][1].order_lines[0])).not.toContain("discount_unit_vnd");
  const data = await form("draft");
  data.set("discountMode", "AMOUNT"); data.set("discountValue", "1000");
  await expect(createSalesOrderAction(undefined, data)).resolves.toEqual({ message: "Bạn không có quyền giảm giá. Bỏ giảm giá hoặc nhờ người quản lý giá." });
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
