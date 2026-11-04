// D64 "Tạo nhiều vật tư" and "Tạo nhiều nhà cung cấp": the assistant reads a list (an Excel / CSV file or a photo) and prepares
// ONE card whose rows are "Tạo" or "Bỏ qua" (already there, unknown group or unit, no name). Each row is saved through the normal
// catalog command with its own operation id derived from the action, so a second confirm only finishes the missing rows.
import { z } from "zod";

import { normalizePhone } from "@/lib/auth/login-identifier";
import { matchRecord, phoneKey } from "@/modules/sales/order-match";
import { derivedOperationId, finishBatch, normalizeRef, rowFailureText } from "./batch-common";
import type { AgentAction, ListView } from "./registry";
import { findSupplier, ResolveError } from "./resolve";

export const CATALOG_BATCH_MAX = 150;
const CODE = /^[A-Z0-9_-]{2,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (max: number) => z.string().trim().max(max).optional().default("");
const flag = z.boolean().optional().default(true);

export type CatalogRow = { n: number; status: "CREATE" | "SKIP"; reason?: string; code: string; label: string; [key: string]: unknown };
const generated = (prefix: string, actionKey: string, n: number) => `${prefix}${actionKey.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase()}${String(n).padStart(2, "0")}`;

/* ---------- Vật tư ---------- */

type Group = { id: string; code: string; name: string };
type Unit = { id: string; code: string; name: string; symbol: string };
type ExistingMaterial = { code: string; name: string };
export type MaterialRow = CatalogRow & { name: string; groupId: string; groupName: string; uomId: string; uomSymbol: string; specification: string; sale: boolean; purchase: boolean };
const materialRow = z.object({ ten: text(160), ma: z.string().trim().toUpperCase().max(32).optional().default(""), nhom: text(120), don_vi: text(40), quy_cach: text(300), ban: flag, mua: flag });

export function checkMaterialRows(input: readonly unknown[], existing: readonly ExistingMaterial[], groups: readonly Group[], units: readonly Unit[], actionKey: string): MaterialRow[] {
  const codes = new Map(existing.map((row) => [row.code.toUpperCase(), row])), names = new Map(existing.map((row) => [normalizeRef(row.name), row]));
  const seenCode = new Map<string, number>(), seenName = new Map<string, number>();
  return input.map((raw, index): MaterialRow => {
    const n = index + 1;
    const parsed = materialRow.safeParse(raw ?? {});
    const value = parsed.success ? parsed.data : materialRow.parse({});
    const code = value.ma || generated("VT", actionKey, n);
    const base: MaterialRow = { n, status: "SKIP", code, label: value.ten || "—", name: value.ten, groupId: "", groupName: value.nhom, uomId: "", uomSymbol: value.don_vi, specification: value.quy_cach, sale: value.ban, purchase: value.mua };
    const skip = (reason: string, patch: Partial<MaterialRow> = {}): MaterialRow => ({ ...base, ...patch, reason });
    if (!parsed.success || value.ten.length < 2) return skip("Thiếu tên vật tư");
    if (!CODE.test(code)) return skip("Mã vật tư chỉ gồm chữ in hoa, số, - hoặc _");
    if (!value.ban && !value.mua) return skip("Vật tư phải cho phép bán hoặc mua");
    const sameCode = codes.get(code) ?? names.get(normalizeRef(value.ten));
    if (sameCode) return skip(`Đã có: ${sameCode.code} · ${sameCode.name}`);
    const earlier = seenCode.get(code) ?? seenName.get(normalizeRef(value.ten));
    if (earlier) return skip(`Trùng dòng ${earlier}`);
    if (!value.nhom) return skip(`Thiếu nhóm vật tư (có: ${groups.slice(0, 8).map((group) => group.name).join(", ")})`);
    const group = matchRecord(groups, value.nhom, { code: (row) => row.code, name: (row) => row.name });
    if (!group.found) return skip(`Không có nhóm vật tư "${value.nhom}" (có: ${groups.slice(0, 8).map((row) => row.name).join(", ")})`);
    if (!value.don_vi) return skip("Thiếu đơn vị tính");
    const wanted = normalizeRef(value.don_vi);
    const unit = units.find((item) => [item.symbol, item.code, item.name].some((candidate) => normalizeRef(candidate) === wanted));
    if (!unit) return skip(`Không có đơn vị "${value.don_vi}"`, { groupId: group.found.id, groupName: group.found.name });
    seenCode.set(code, n);
    seenName.set(normalizeRef(value.ten), n);
    return { ...base, status: "CREATE", groupId: group.found.id, groupName: group.found.name, uomId: unit.id, uomSymbol: unit.symbol };
  });
}

export const createMaterials: AgentAction = {
  kind: "soan_tao_nhieu_vat_tu", area: "Mua hàng & kho", permissions: ["catalog.manage"],
  description: `Soạn tạo NHIỀU vật tư một lần (tối đa ${CATALOG_BATCH_MAX}) từ danh sách người dùng gửi (Excel/CSV hoặc ảnh). Mỗi vật tư cần tên, nhóm vật tư và đơn vị gốc; `
    + "không bịa nhóm hay đơn vị, thiếu thì để trống để hệ thống báo. Giá bán, quy đổi đơn vị đặt sau trong màn Vật tư. Có `nha_cung_cap` thì gán luôn nhà cung cấp đó cho các vật tư (cần quyền giá mua).",
  properties: {
    nha_cung_cap: { type: "string", description: "Nhà cung cấp bán các vật tư này (mã hoặc tên); trống = không gán." },
    vat_tu: { type: "array", description: "Các vật tư theo thứ tự trong danh sách.", items: { type: "object", additionalProperties: false, required: ["ten"], properties: {
      ten: { type: "string" }, ma: { type: "string", description: "Mã vật tư nếu danh sách có; trống = tự đặt." }, nhom: { type: "string", description: "Nhóm vật tư (mã hoặc tên)." },
      don_vi: { type: "string", description: "Đơn vị gốc (bao, kg, m³, cây…)." }, quy_cach: { type: "string" }, ban: { type: "boolean", description: "Cho phép bán; mặc định true." }, mua: { type: "boolean", description: "Cho phép mua; mặc định true." } } } },
  },
  async prepare(context, input) {
    const value = z.object({ nha_cung_cap: z.string().trim().optional().default(""), vat_tu: z.array(z.unknown()).min(1).max(CATALOG_BATCH_MAX) }).parse(input);
    let supplier: { id: string; name: string } | null = null;
    if (value.nha_cung_cap) {
      if (!context.permissions.has("purchasing.price.manage")) throw new ResolveError("Gán nhà cung cấp cần quyền nhập giá mua. Bỏ nhà cung cấp hoặc nhờ quản lý cấp quyền.");
      supplier = await findSupplier(context.supabase, context.branchId, value.nha_cung_cap);
    }
    const [materialResult, groupResult, unitResult] = await Promise.all([
      context.supabase.from("materials").select("code, name").limit(20000),
      context.supabase.from("material_groups").select("id, code, name").eq("active", true).order("name").limit(1000),
      context.supabase.from("units_of_measure").select("id, code, name, symbol").limit(1000),
    ]);
    if (materialResult.error || groupResult.error || unitResult.error) throw new ResolveError("Chưa đọc được danh mục vật tư. Thử lại.");
    const rows = checkMaterialRows(value.vat_tu, (materialResult.data ?? []) as ExistingMaterial[], (groupResult.data ?? []) as Group[], (unitResult.data ?? []) as Unit[], crypto.randomUUID());
    const create = rows.filter((row) => row.status === "CREATE").length;
    if (!create) throw new ResolveError(`Không có vật tư mới để tạo: ${rows.slice(0, 8).map((row) => `dòng ${row.n} ${row.reason}`).join("; ")}.`);
    return { title: `Tạo ${create} vật tư`, payload: { supplierId: supplier?.id ?? null, supplierName: supplier?.name ?? null, rows },
      summary: [{ label: "Sẽ tạo", value: `${create} vật tư` }, ...(rows.length > create ? [{ label: "Bỏ qua", value: `${rows.length - create} dòng (trùng hoặc thiếu thông tin)` }] : []),
        ...(supplier ? [{ label: "Gán nhà cung cấp", value: supplier.name }] : [])] };
  },
  view(payload): ListView | null {
    const rows = payload.rows as MaterialRow[] | undefined;
    if (!rows) return null;
    return { columns: ["Vật tư", "Nhóm", "Đơn vị", "Mã"], verb: "tạo", noun: "vật tư", okLabel: "Tạo",
      rows: rows.map((row) => ({ n: row.n, status: row.status, ...(row.reason ? { reason: row.reason } : {}), cells: [row.name || "—", row.groupName || "—", row.uomSymbol || "—", row.code] })) };
  },
  async execute(context, payload, actionId, options) {
    const rows = ((payload.rows ?? []) as MaterialRow[]).filter((row) => row.status === "CREATE" && !options?.exclude?.includes(row.n));
    if (!rows.length) throw new ResolveError("Chưa chọn vật tư nào để tạo.");
    const failed: string[] = [];
    let done = 0;
    for (const row of rows) {
      const id = derivedOperationId(actionId, `row:${row.n}`);
      const { error } = await context.supabase.rpc("save_catalog_record", { kind: "materials", target_id: id, target_branch_id: context.branchId, expected_json: null,
        change_reason: "Trợ lý AI tạo vật tư từ danh sách", operation_id: id,
        values_json: { code: row.code, name: row.name, group_id: row.groupId, base_uom_id: row.uomId, specification: row.specification || null, sale_enabled: row.sale, purchase_enabled: row.purchase, active: true } });
      if (error) { failed.push(`dòng ${row.n} ${row.name} (${rowFailureText(error.message)})`); continue; }
      if (payload.supplierId && row.purchase) {
        const link = await context.supabase.rpc("set_supplier_material_assignments", { target_branch_id: context.branchId, operation_id: derivedOperationId(actionId, `row:${row.n}:assign`),
          items: [{ supplier_id: payload.supplierId, material_id: id, purchase_uom_id: row.uomId, active: true }] });
        if (link.error) { failed.push(`dòng ${row.n} ${row.name} (đã tạo, chưa gán nhà cung cấp)`); continue; }
      }
      done += 1;
    }
    return { link: "/admin/products", message: finishBatch(done, rows.length, failed, "vật tư") };
  },
};

/* ---------- Nhà cung cấp ---------- */

type ExistingSupplier = { code: string; name: string; phone: string | null };
export type SupplierRow = CatalogRow & { name: string; phone: string; address: string; email: string; taxCode: string; days: string };
const supplierRow = z.object({ ten: text(160), ma: z.string().trim().toUpperCase().max(32).optional().default(""), dien_thoai: text(40), dia_chi: text(300), email: text(160), ma_so_thue: text(20), han_thanh_toan: z.union([z.string(), z.number()]).optional() });

export function checkSupplierRows(input: readonly unknown[], existing: readonly ExistingSupplier[], actionKey: string): SupplierRow[] {
  const codes = new Map(existing.map((row) => [row.code.toUpperCase(), row])), names = new Map(existing.map((row) => [normalizeRef(row.name), row]));
  const phones = new Map<string, ExistingSupplier>();
  for (const row of existing) { const key = phoneKey(row.phone); if (key && !phones.has(key)) phones.set(key, row); }
  const seen = new Map<string, number>();
  return input.map((raw, index): SupplierRow => {
    const n = index + 1;
    const parsed = supplierRow.safeParse(raw ?? {});
    const value = parsed.success ? parsed.data : supplierRow.parse({});
    const code = value.ma || generated("NCC", actionKey, n);
    const phone = normalizePhone(value.dien_thoai) ?? value.dien_thoai;
    const days = String(value.han_thanh_toan ?? "0").replace(/\D/g, "") || "0";
    const base: SupplierRow = { n, status: "SKIP", code, label: value.ten || "—", name: value.ten, phone, address: value.dia_chi, email: value.email.toLowerCase(), taxCode: value.ma_so_thue, days };
    const skip = (reason: string): SupplierRow => ({ ...base, reason });
    if (!parsed.success || value.ten.length < 2) return skip("Thiếu tên nhà cung cấp");
    if (!CODE.test(code)) return skip("Mã chỉ gồm chữ in hoa, số, - hoặc _");
    if (base.email && !EMAIL.test(base.email)) return skip("Email chưa đúng");
    if (Number(days) > 365) return skip("Hạn thanh toán tối đa 365 ngày");
    const key = phoneKey(phone);
    const same = codes.get(code) ?? names.get(normalizeRef(value.ten)) ?? (key ? phones.get(key) : undefined);
    if (same) return skip(`Đã có: ${same.code} · ${same.name}`);
    const earlier = seen.get(normalizeRef(value.ten)) ?? (key ? seen.get(`p:${key}`) : undefined) ?? seen.get(`c:${code}`);
    if (earlier) return skip(`Trùng dòng ${earlier}`);
    seen.set(normalizeRef(value.ten), n); seen.set(`c:${code}`, n); if (key) seen.set(`p:${key}`, n);
    return { ...base, status: "CREATE" };
  });
}

export const createSuppliers: AgentAction = {
  kind: "soan_tao_nhieu_nha_cung_cap", area: "Mua hàng & kho", permissions: ["suppliers.manage"],
  description: `Soạn tạo NHIỀU nhà cung cấp một lần (tối đa ${CATALOG_BATCH_MAX}) từ danh sách người dùng gửi (Excel/CSV hoặc ảnh). Không bịa số điện thoại; hệ thống đánh dấu dòng trùng nhà cung cấp đã có.`,
  properties: { nha_cung_cap: { type: "array", description: "Các nhà cung cấp theo thứ tự trong danh sách.", items: { type: "object", additionalProperties: false, required: ["ten"], properties: {
    ten: { type: "string" }, ma: { type: "string", description: "Mã nếu có; trống = tự đặt." }, dien_thoai: { type: "string" }, dia_chi: { type: "string" }, email: { type: "string" },
    ma_so_thue: { type: "string" }, han_thanh_toan: { type: "string", description: "Số ngày được nợ, ví dụ 30; trống = 0." } } } } },
  async prepare(context, input) {
    const value = z.object({ nha_cung_cap: z.array(z.unknown()).min(1).max(CATALOG_BATCH_MAX) }).parse(input);
    const { data, error } = await context.supabase.from("suppliers").select("code, name, phone").eq("branch_id", context.branchId).limit(10000);
    if (error) throw new ResolveError("Chưa đọc được danh sách nhà cung cấp hiện có. Thử lại.");
    const rows = checkSupplierRows(value.nha_cung_cap, (data ?? []) as ExistingSupplier[], crypto.randomUUID());
    const create = rows.filter((row) => row.status === "CREATE").length;
    if (!create) throw new ResolveError(`Không có nhà cung cấp mới để tạo: ${rows.slice(0, 8).map((row) => `dòng ${row.n} ${row.reason}`).join("; ")}.`);
    return { title: `Tạo ${create} nhà cung cấp`, payload: { rows }, summary: [{ label: "Sẽ tạo", value: `${create} nhà cung cấp` }, ...(rows.length > create ? [{ label: "Bỏ qua", value: `${rows.length - create} dòng (trùng hoặc thiếu tên)` }] : [])] };
  },
  view(payload): ListView | null {
    const rows = payload.rows as SupplierRow[] | undefined;
    if (!rows) return null;
    return { columns: ["Nhà cung cấp", "Điện thoại", "Địa chỉ"], verb: "tạo", noun: "nhà cung cấp", okLabel: "Tạo",
      rows: rows.map((row) => ({ n: row.n, status: row.status, ...(row.reason ? { reason: row.reason } : {}), cells: [row.name || "—", row.phone || "—", row.address || "—"] })) };
  },
  async execute(context, payload, actionId, options) {
    const rows = ((payload.rows ?? []) as SupplierRow[]).filter((row) => row.status === "CREATE" && !options?.exclude?.includes(row.n));
    if (!rows.length) throw new ResolveError("Chưa chọn nhà cung cấp nào để tạo.");
    const failed: string[] = [];
    let done = 0;
    for (const row of rows) {
      const id = derivedOperationId(actionId, `row:${row.n}`);
      const { error } = await context.supabase.rpc("save_catalog_record", { kind: "suppliers", target_id: id, target_branch_id: context.branchId, expected_json: null,
        change_reason: "Trợ lý AI tạo nhà cung cấp từ danh sách", operation_id: id,
        values_json: { code: row.code, name: row.name, phone: row.phone || null, email: row.email || null, address_text: row.address || null, tax_code: row.taxCode || null, payment_terms_days: row.days, active: true } });
      if (error) failed.push(`dòng ${row.n} ${row.name} (${rowFailureText(error.message)})`); else done += 1;
    }
    return { link: "/admin/suppliers", message: finishBatch(done, rows.length, failed, "nhà cung cấp") };
  },
};
