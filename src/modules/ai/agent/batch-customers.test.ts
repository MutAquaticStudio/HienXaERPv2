// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkRows, createCustomers, generatedCode, keptPhone } from "./batch-customers";

const existing = [{ code: "KH0012", display_name: "Anh Tư", phone: "0905 111 222" }, { code: "KH0013", display_name: "Cửa hàng Minh", phone: null }];

describe("D63 Tạo nhiều khách hàng", () => {
  it("keeps Vietnamese phones as 0xxxxxxxxx, including an Excel number that lost its leading zero", () => {
    expect(keptPhone("+84 912 345 678")).toBe("0912345678");
    expect(keptPhone("912345678")).toBe("0912345678");
    expect(keptPhone("028 3822 1234")).toBe("02838221234");
    expect(keptPhone("")).toBe("");
  });

  it("marks rows already customers (phone, code), twice in the list or without a name, and creates the rest", () => {
    const rows = checkRows([
      { ten: "Công ty An Phát", dien_thoai: "0912345678", dia_chi_giao: "12 Lê Lợi" },
      { ten: "Chị Lan", dien_thoai: "905111222" },
      { ten: "Đại lý Hòa", ma: "kh0013" },
      { ten: "An Phát (lặp)", dien_thoai: "+84912345678" },
      { ten: "", dien_thoai: "0988000111" },
      { ten: "Anh Ba", loai: "INDIVIDUAL", email: "ba@example" },
      { ten: "Anh Bốn", loai: "INDIVIDUAL", email: "BON@Example.com", ma_so_thue: "0312345678" },
    ], existing, "abcdef12-0000-4000-8000-000000000001");
    expect(rows.map((row) => [row.n, row.status, row.reason ?? ""])).toEqual([
      [1, "CREATE", ""], [2, "SKIP", "Đã có: KH0012 · Anh Tư"], [3, "SKIP", "Đã có: KH0013 · Cửa hàng Minh"], [4, "SKIP", "Trùng dòng 1"],
      [5, "SKIP", "Thiếu tên khách"], [6, "SKIP", "Email chưa đúng"], [7, "CREATE", ""],
    ]);
    expect(rows[0]).toMatchObject({ code: generatedCode("abcdef12-0000-4000-8000-000000000001", 1), loai: "BUSINESS", dien_thoai: "0912345678" });
    expect(rows[6]).toMatchObject({ email: "bon@example.com", ma_so_thue: "0312345678", loai: "INDIVIDUAL" });
    expect(rows[0].code).toMatch(/^[A-Z0-9_-]{2,32}$/);
  });

  it("prepares one card with every row, and refuses a list with nothing new", async () => {
    const supabase = { from: () => { const q: Record<string, unknown> = { select: () => q, eq: () => q, limit: async () => ({ data: existing, error: null }) }; return q; } };
    const context = { supabase: supabase as never, branchId: "b1", permissions: new Set(["customers.manage"]) };
    const prepared = await createCustomers.prepare(context, { khach: [{ ten: "Công ty An Phát", dien_thoai: "0912345678" }, { ten: "Chị Lan", dien_thoai: "0905111222" }] });
    expect(prepared.title).toBe("Tạo 1 khách hàng");
    expect(prepared.summary).toEqual([{ label: "Sẽ tạo", value: "1 khách" }, { label: "Bỏ qua", value: "1 dòng (trùng hoặc thiếu tên)" }]);
    expect((prepared.payload.rows as unknown[]).length).toBe(2);
    await expect(createCustomers.prepare(context, { khach: [{ ten: "Chị Lan", dien_thoai: "0905111222" }] })).rejects.toThrow("Không có khách mới để tạo");
  });

  it("creates the chosen rows (and their site) with ids derived from the action, and keeps the card waiting when a row fails", async () => {
    const rpc = vi.fn(async (_name: string, args: { kind: string; values_json: { code?: string } }) =>
      args.kind === "customers" && args.values_json.code === "KHBAD" ? { error: { message: "duplicate key value violates unique constraint (23505)" } } : { error: null });
    const context = { supabase: { rpc } as never, branchId: "b1", permissions: new Set(["customers.manage"]) };
    const rows = [
      { n: 1, ten: "An Phát", loai: "BUSINESS", dien_thoai: "0912345678", dia_chi_giao: "12 Lê Lợi", email: "", ma_so_thue: "", ghi_chu: "", code: "KHA01", status: "CREATE" },
      { n: 2, ten: "Chị Lan", loai: "INDIVIDUAL", dien_thoai: "", dia_chi_giao: "", email: "", ma_so_thue: "", ghi_chu: "", code: "KHA02", status: "CREATE" },
      { n: 3, ten: "Trùng", loai: "BUSINESS", dien_thoai: "", dia_chi_giao: "", email: "", ma_so_thue: "", ghi_chu: "", code: "KHA03", status: "SKIP", reason: "Trùng dòng 1" },
    ];
    const actionId = "11111111-1111-4111-8111-111111111111";
    const done = await createCustomers.execute(context, { rows }, actionId, { exclude: [2] });
    expect(done.message).toBe("Đã tạo 1 khách hàng, bỏ qua 2 dòng.");
    expect(rpc).toHaveBeenCalledTimes(2);
    const [customer, site] = rpc.mock.calls.map((call) => call[1] as unknown as Record<string, unknown>);
    expect(customer).toMatchObject({ kind: "customers", operation_id: customer.target_id, values_json: { code: "KHA01", display_name: "An Phát", phone: "0912345678" } });
    expect(site).toMatchObject({ kind: "sites", values_json: { customer_id: customer.target_id, code: "CT1", address_text: "12 Lê Lợi" } });
    // Again: the same ids, so the database replays instead of creating twice.
    await createCustomers.execute(context, { rows }, actionId, { exclude: [2] });
    expect((rpc.mock.calls[2][1] as unknown as Record<string, unknown>).target_id).toBe(customer.target_id);

    rpc.mockClear();
    await expect(createCustomers.execute(context, { rows: [{ ...rows[1], code: "KHBAD" }, rows[0]] }, actionId)).rejects.toThrow("Đã tạo 1/2 khách. Chưa tạo được: dòng 2 Chị Lan (mã khách đã có)");
    await expect(createCustomers.execute(context, { rows }, actionId, { exclude: [1, 2] })).rejects.toThrow("Chưa chọn khách nào");
  });
});
