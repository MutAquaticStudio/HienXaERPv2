// D64 "Cập nhật giá mua": the assistant reads a supplier's price list (a photo, a PDF or an Excel file) and prepares ONE card:
// each row shows the price now and the new one. A material the supplier has a price for is saved as a new version over the
// newest one (the same path as the Giá mua book); a new pair is added with its price. Each row is saved on its own with an
// operation id derived from the action, so confirming again after a failure only finishes the rows still missing.
import { z } from "zod";

import { effectivePriceState } from "@/modules/pricing/effective-state";
import { matchRecord } from "@/modules/sales/order-match";
import { dateOrToday, derivedOperationId, finishBatch, normalizeRef, parseVnd, rowFailureText, vnFormat } from "./batch-common";
import type { AgentAction, AgentContext, ListView } from "./registry";
import { findSupplier, ResolveError } from "./resolve";

export const PRICE_UPDATE_KIND = "soan_cap_nhat_gia_mua";
export const PRICE_UPDATE_MAX = 150;

type Material = { id: string; code: string; name: string; base_uom_id: string };
type Unit = { id: string; code: string; name: string; symbol: string };
type Rule = { id: string; material_id: string; purchase_uom_id: string; unit_cost_vnd: string; version: number; active: boolean; effective_from: string; effective_to: string | null };
type Assignment = { material_id: string; purchase_uom_id: string };
type Conversion = { material_id: string; from_uom_id: string; to_uom_id: string };

export type PriceRow = {
  n: number; label: string; unit: string; uomId: string; materialId: string; price: string; current: string | null;
  supersedesId?: string; expectedVersion?: number; status: "CREATE" | "SKIP"; reason?: string;
};

const rowSchema = z.object({ hang: z.string().trim().max(200).optional().default(""), don_vi: z.string().trim().max(40).optional().default(""), gia: z.union([z.string(), z.number()]).optional() });
const inputSchema = z.object({ nha_cung_cap: z.string().trim().min(1), ngay: z.string().trim().optional().default(""), dong: z.array(z.unknown()).min(1).max(PRICE_UPDATE_MAX) });

const unitOf = (units: readonly Unit[], ref: string) => {
  const wanted = normalizeRef(ref);
  return units.find((unit) => [unit.symbol, unit.code, unit.name].some((value) => normalizeRef(value) === wanted)) ?? null;
};

export type PriceInputs = { materials: Material[]; units: Unit[]; rules: Rule[]; assignments: Assignment[]; conversions: Conversion[]; now: number; startsAt: number };

/** Every row of the list matched to a material and a unit, and compared with the price in force. */
export function checkPriceRows(input: readonly unknown[], data: PriceInputs): PriceRow[] {
  const seen = new Map<string, number>();
  return input.map((raw, index): PriceRow => {
    const n = index + 1;
    const parsed = rowSchema.safeParse(raw ?? {});
    const value = parsed.success ? parsed.data : rowSchema.parse({});
    const blank: PriceRow = { n, label: value.hang || "—", unit: value.don_vi, uomId: "", materialId: "", price: "", current: null, status: "SKIP" };
    const skip = (reason: string, patch: Partial<PriceRow> = {}): PriceRow => ({ ...blank, ...patch, status: "SKIP", reason });
    if (!parsed.success || !value.hang) return skip("Thiếu tên hàng");
    const price = parseVnd(parsed.data.gia);
    if (!price) return skip("Giá chưa đúng (số nguyên dương)");
    const match = matchRecord(data.materials, value.hang, { code: (row) => row.code, name: (row) => row.name });
    if (!match.found) return skip(match.candidates.length ? `Có nhiều vật tư khớp: ${match.candidates.slice(0, 4).map((row) => `${row.code} ${row.name}`).join("; ")}` : "Không có vật tư này (hoặc không cho phép mua)");
    const material = match.found;
    const label = `${material.name} (${material.code})`;
    const own = data.rules.filter((rule) => rule.material_id === material.id);
    let uomId: string | undefined;
    if (value.don_vi) {
      const unit = unitOf(data.units, value.don_vi);
      if (!unit) return skip(`Không có đơn vị "${value.don_vi}"`, { label, materialId: material.id });
      uomId = unit.id;
    } else uomId = data.assignments.find((item) => item.material_id === material.id)?.purchase_uom_id ?? own[0]?.purchase_uom_id ?? material.base_uom_id;
    const unit = data.units.find((item) => item.id === uomId);
    const unitLabel = unit?.symbol ?? "";
    const usable = uomId === material.base_uom_id || data.conversions.some((item) => item.material_id === material.id && item.from_uom_id === uomId && item.to_uom_id === material.base_uom_id);
    if (!usable) return skip(`${unitLabel || "Đơn vị"} không phải đơn vị mua của vật tư`, { label, unit: unitLabel, materialId: material.id });
    const key = `${material.id}:${uomId}`;
    const earlier = seen.get(key);
    if (earlier) return skip(`Trùng dòng ${earlier}`, { label, unit: unitLabel, materialId: material.id });
    seen.set(key, n);
    const scope = own.filter((rule) => rule.purchase_uom_id === uomId && rule.active);
    const latest = [...scope].sort((left, right) => right.version - left.version)[0];
    const current = scope.filter((rule) => effectivePriceState(rule, data.now) === "ACTIVE").sort((left, right) => right.version - left.version)[0];
    const row: PriceRow = { n, label, unit: unitLabel, uomId: uomId!, materialId: material.id, price, current: current?.unit_cost_vnd ?? null, status: "CREATE" };
    if (latest && Date.parse(latest.effective_from) > data.startsAt) return skip(`Đã có giá hiệu lực từ ${new Date(latest.effective_from).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}, sau ngày áp dụng`, row);
    if (latest && latest.unit_cost_vnd === price && current?.id === latest.id) return skip(`Giá không đổi (${vnFormat(price)} ₫)`, row);
    return latest ? { ...row, supersedesId: latest.id, expectedVersion: latest.version } : row;
  });
}

export const updatePurchasePrices: AgentAction = {
  kind: PRICE_UPDATE_KIND, area: "Mua hàng & kho", permissions: ["purchasing.price.manage", "purchasing.price.read"],
  description: `Soạn cập nhật GIÁ MUA của một nhà cung cấp từ bảng giá người dùng gửi (ảnh chụp, PDF hoặc Excel), tối đa ${PRICE_UPDATE_MAX} dòng một thẻ. `
    + "Đưa mọi dòng đọc được, giá viết số nguyên đồng (85000); hệ thống so với giá đang dùng và đánh dấu dòng không đổi / không khớp vật tư. "
    + "Giá áp dụng từ 00:00 ngày `ngay` (trống = hôm nay).",
  properties: {
    nha_cung_cap: { type: "string", description: "Mã hoặc tên nhà cung cấp." }, ngay: { type: "string", description: "Ngày áp dụng yyyy-mm-dd; trống = hôm nay." },
    dong: { type: "array", description: "Các dòng giá theo thứ tự trong bảng giá.", items: { type: "object", additionalProperties: false, required: ["hang", "gia"], properties: {
      hang: { type: "string", description: "Mã hoặc tên hàng như trong bảng giá." }, don_vi: { type: "string", description: "Đơn vị mua (bao, tấn, m³…); trống = đơn vị đã gán cho nhà cung cấp hoặc đơn vị gốc." },
      gia: { type: "string", description: "Giá mua một đơn vị, số nguyên đồng, ví dụ 85000." } } } },
  },
  async prepare(context: AgentContext, input) {
    const value = inputSchema.parse(input);
    const supplier = await findSupplier(context.supabase, context.branchId, value.nha_cung_cap);
    const date = dateOrToday(value.ngay);
    const [materialResult, unitResult] = await Promise.all([
      context.supabase.from("materials").select("id, code, name, base_uom_id").eq("active", true).eq("purchase_enabled", true).limit(5000),
      context.supabase.from("units_of_measure").select("id, code, name, symbol").limit(1000),
    ]);
    if (materialResult.error || unitResult.error) throw new ResolveError("Chưa đọc được danh mục vật tư. Thử lại.");
    const materials = (materialResult.data ?? []) as Material[];
    const ids = materials.map((row) => row.id);
    const [ruleResult, assignmentResult, conversionResult] = await Promise.all([
      context.supabase.from("purchase_price_rules").select("id, material_id, purchase_uom_id, unit_cost_vnd::text, version, active, effective_from, effective_to").eq("branch_id", context.branchId).eq("supplier_id", supplier.id).eq("active", true).limit(10000),
      context.supabase.from("supplier_materials").select("material_id, purchase_uom_id").eq("supplier_id", supplier.id).eq("active", true).limit(5000),
      ids.length ? context.supabase.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id").in("material_id", ids.slice(0, 1000)).eq("active", true).eq("settlement_allowed", true).limit(5000) : Promise.resolve({ data: [], error: null }),
    ]);
    if (ruleResult.error || assignmentResult.error || conversionResult.error) throw new ResolveError("Chưa đọc được giá mua hiện tại. Thử lại.");
    const rows = checkPriceRows(value.dong, { materials, units: (unitResult.data ?? []) as Unit[], rules: (ruleResult.data ?? []) as unknown as Rule[],
      assignments: (assignmentResult.data ?? []) as Assignment[], conversions: (conversionResult.data ?? []) as Conversion[], now: Date.now(), startsAt: Date.parse(`${date}T00:00:00+07:00`) });
    const save = rows.filter((row) => row.status === "CREATE").length;
    if (!save) throw new ResolveError(`Không có giá nào để cập nhật: ${rows.slice(0, 8).map((row) => `dòng ${row.n} ${row.reason}`).join("; ")}.`);
    const skipped = rows.length - save;
    return { title: `Cập nhật ${save} giá mua của ${supplier.name}`, payload: { supplierId: supplier.id, supplierName: supplier.name, date, rows },
      summary: [{ label: "Nhà cung cấp", value: supplier.name }, { label: "Áp dụng từ", value: `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}` },
        { label: "Sẽ lưu", value: `${save} giá` }, ...(skipped ? [{ label: "Bỏ qua", value: `${skipped} dòng (không đổi hoặc không khớp)` }] : [])] };
  },
  view(payload): ListView | null {
    const rows = payload.rows as PriceRow[] | undefined;
    if (!rows) return null;
    return { columns: ["Vật tư", "Giá mua (hiện tại → mới)", "ĐVT mua"], verb: "lưu", noun: "giá", okLabel: "Lưu giá",
      rows: rows.map((row) => ({ n: row.n, status: row.status, ...(row.reason ? { reason: row.reason } : {}),
        cells: [row.label, row.price ? `${row.current ? `${vnFormat(row.current)} → ` : "Mới: "}${vnFormat(row.price)} ₫` : "—", row.unit || "—"] })) };
  },
  async execute(context, payload, actionId, options) {
    const date = String(payload.date);
    if (date < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date())) throw new ResolveError("Ngày áp dụng đã qua. Hỏi trợ lý soạn lại với ngày hôm nay.");
    const rows = ((payload.rows ?? []) as PriceRow[]).filter((row) => row.status === "CREATE" && !options?.exclude?.includes(row.n));
    if (!rows.length) throw new ResolveError("Chưa chọn giá nào để lưu.");
    const failed: string[] = [];
    let done = 0;
    for (const row of rows) {
      const { error } = await context.supabase.rpc("save_purchase_price_book", { target_branch_id: context.branchId, effective_from: `${date}T00:00:00+07:00`,
        change_reason: "Trợ lý AI cập nhật giá mua", operation_id: derivedOperationId(actionId, `row:${row.n}`),
        items: [{ supplier_id: payload.supplierId, material_id: row.materialId, purchase_uom_id: row.uomId, unit_cost_vnd: row.price,
          ...(row.supersedesId ? { supersedes_id: row.supersedesId, expected_version: row.expectedVersion } : {}) }] });
      if (error) failed.push(`dòng ${row.n} ${row.label} (${rowFailureText(error.message)})`); else done += 1;
    }
    return { link: "/admin/suppliers/pricing", message: finishBatch(done, rows.length, failed, "giá mua") };
  },
};
