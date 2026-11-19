import { expect, it } from "vitest";

import { loadBulkPortalPlan, planBulkPortalAccounts, type BulkCustomer } from "./bulk-portal";

const c = (code: string, phone: string | null, extra: Partial<BulkCustomer> = {}): BulkCustomer => ({ id: `id-${code}`, code, display_name: `Khách ${code}`, phone, active: true, ...extra });

it("gives a login only to a customer with a phone of their own and no login yet (D71)", () => {
  const plan = planBulkPortalAccounts([
    c("KH001", "0912 345 678"), c("KH002", "+84 987 654 321"), c("KH003", null), c("KH004", "12345"),
    c("KH005", "0981168486"), c("KH006", "0981168486"), c("KH007", "0911000111", { active: false }), c("KH008", "0922000222"),
  ], new Set(["id-KH008"]));
  expect(plan.eligible.map((item) => [item.code, item.phone, item.login])).toEqual([
    ["KH001", "0912345678", "0912345678@sdt.hienxavlxd.com"], ["KH002", "0987654321", "0987654321@sdt.hienxavlxd.com"],
  ]);
  expect(Object.fromEntries(plan.skipped.map((item) => [item.code, item.reason]))).toEqual({
    KH003: "Chưa có số điện thoại",
    KH004: "Số điện thoại chưa đúng định dạng",
    KH005: "Số điện thoại dùng chung với KH006",
    KH006: "Số điện thoại dùng chung với KH005",
    KH007: "Khách đã ngừng hoạt động",
    KH008: "Đã có tài khoản",
  });
});

it("skips every customer of a shared phone, whatever way it is typed", () => {
  const plan = planBulkPortalAccounts([c("A", "0981168486"), c("B", "0981 168 486"), c("C", "+84981168486")], new Set());
  expect(plan.eligible).toEqual([]);
  expect(plan.skipped).toHaveLength(3);
});

it("reads the branch's customers and active logins and orders them by code", async () => {
  const tables: Record<string, unknown> = {
    customers: [c("KH010", "0911111111"), c("KH002", "0922222222")],
    customer_portal_memberships: [{ customer_id: "id-KH002" }],
  };
  const supabase = { from: (table: string) => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: tables[table], error: null }) }) }) }) };
  const plan = await loadBulkPortalPlan(supabase, "b1");
  expect(plan.eligible.map((item) => item.code)).toEqual(["KH010"]);
  expect(plan.skipped.map((item) => item.code)).toEqual(["KH002"]);
});

it("fails loudly when the customers cannot be read", async () => {
  const supabase = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: "x" } }) }) }) }) };
  await expect(loadBulkPortalPlan(supabase, "b1")).rejects.toThrow("Không tải được danh sách khách hàng.");
});
