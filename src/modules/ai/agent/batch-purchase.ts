// D64 "Đơn mua từ chứng từ": the assistant reads a supplier's invoice / delivery note (a photo, a PDF or an Excel file) and prepares ONE
// card of its lines. The prices come from the supplier's Giá mua book; a price printed on the document that differs is used only by
// someone who may manage purchase prices (and is saved as an approved manual price), otherwise the line is skipped and the book should
// be updated first. Confirming creates the purchase order and, when asked, receives the goods into the warehouse.
import { z } from "zod";

import { buildWarehouseLines } from "@/modules/purchasing/warehouse-lines";
import { matchRecord } from "@/modules/sales/order-match";
import { formatVnd, vnd } from "@/lib/core/money";
import { derivedOperationId, normalizeRef, parseQuantity, parseVnd, vnFormat } from "./batch-common";
import type { AgentAction, ListView } from "./registry";
import { findSupplier, findWarehouse, ResolveError } from "./resolve";

export const PURCHASE_DOC_MAX = 40;

type Material = { id: string; code: string; name: string; base_uom_id: string };
type Unit = { id: string; code: string; name: string; symbol: string };
type Rule = { material_id: string; purchase_uom_id: string; unit_cost_vnd: string };
type Assignment = { material_id: string; purchase_uom_id: string };
type Conversion = { material_id: string; from_uom_id: string; to_uom_id: string };

export type PurchaseDocRow = {
  n: number; label: string; unit: string; quantity: string; price: string; manualPrice: string | null; materialId: string; uomId: string; status: "CREATE" | "SKIP"; reason?: string;
  line?: Record<string, unknown>; total?: string;
};

const rowSchema = z.object({ hang: z.string().trim().max(200).optional().default(""), don_vi: z.string().trim().max(40).optional().default(""), so_luong: z.union([z.string(), z.number()]).optional(), gia: z.union([z.string(), z.number()]).optional() });
const inputSchema = z.object({ nha_cung_cap: z.string().trim().min(1), kho: z.string().trim().optional().default(""), so_chung_tu: z.string().trim().max(120).optional().default(""),
  ngay_nhan: z.string().trim().optional().default(""), nhan_hang: z.boolean().optional().default(false), dong: z.array(z.unknown()).min(1).max(PURCHASE_DOC_MAX) });

export type PurchaseDocInputs = { materials: Material[]; units: Unit[]; rules: Rule[]; assignments: Assignment[]; conversions: Conversion[]; canManagePrice: boolean };

/** Every document line matched to a material, a unit and a price; a line that cannot be priced is skipped with the reason. */
export function checkPurchaseRows(input: readonly unknown[], data: PurchaseDocInputs): PurchaseDocRow[] {
  return input.map((raw, index): PurchaseDocRow => {
    const n = index + 1;
    const parsed = rowSchema.safeParse(raw ?? {});
    const value = parsed.success ? parsed.data : rowSchema.parse({});
    const blank: PurchaseDocRow = { n, label: value.hang || "—", unit: value.don_vi, quantity: "", price: "", manualPrice: null, materialId: "", uomId: "", status: "SKIP" };
    const skip = (reason: string, patch: Partial<PurchaseDocRow> = {}): PurchaseDocRow => ({ ...blank, ...patch, status: "SKIP", reason });
    if (!parsed.success || !value.hang) return skip("Thiếu tên hàng");
    const quantity = parseQuantity(parsed.data.so_luong);
    if (!quantity) return skip("Số lượng chưa đúng");
    const match = matchRecord(data.materials, value.hang, { code: (row) => row.code, name: (row) => row.name });
    if (!match.found) return skip(match.candidates.length ? `Có nhiều vật tư khớp: ${match.candidates.slice(0, 4).map((row) => `${row.code} ${row.name}`).join("; ")}` : "Không có vật tư này (hoặc không cho phép mua)");
    const material = match.found;
    const label = `${material.name} (${material.code})`;
    let uomId: string;
    if (value.don_vi) {
      const wanted = normalizeRef(value.don_vi);
      const unit = data.units.find((item) => [item.symbol, item.code, item.name].some((candidate) => normalizeRef(candidate) === wanted));
      if (!unit) return skip(`Không có đơn vị "${value.don_vi}"`, { label, materialId: material.id });
      uomId = unit.id;
    } else uomId = data.assignments.find((item) => item.material_id === material.id)?.purchase_uom_id ?? material.base_uom_id;
    const unitLabel = data.units.find((item) => item.id === uomId)?.symbol ?? "";
    const usable = uomId === material.base_uom_id || data.conversions.some((item) => item.material_id === material.id && item.from_uom_id === uomId && item.to_uom_id === material.base_uom_id);
    const patch = { label, unit: unitLabel, quantity, materialId: material.id, uomId };
    if (!usable) return skip(`${unitLabel || "Đơn vị"} không phải đơn vị mua của vật tư`, patch);
    const rule = data.rules.find((item) => item.material_id === material.id && item.purchase_uom_id === uomId);
    const printed = parsed.data.gia === undefined || String(parsed.data.gia).trim() === "" ? null : parseVnd(parsed.data.gia);
    if (parsed.data.gia !== undefined && String(parsed.data.gia).trim() !== "" && !printed) return skip("Giá trên chứng từ chưa đúng", patch);
    if (printed && (!rule || rule.unit_cost_vnd !== printed)) {
      if (!data.canManagePrice) return skip(rule ? `Giá trên chứng từ ${vnFormat(printed)} ₫ khác bảng giá ${vnFormat(rule.unit_cost_vnd)} ₫; cập nhật Giá mua trước` : `Chưa có giá mua trong bảng giá (chứng từ ghi ${vnFormat(printed)} ₫); cập nhật Giá mua trước`, patch);
      return { ...blank, ...patch, status: "CREATE", price: printed, manualPrice: printed };
    }
    if (!rule) return skip("Không có giá mua hiệu lực của nhà cung cấp này; cập nhật Giá mua trước", patch);
    return { ...blank, ...patch, status: "CREATE", price: rule.unit_cost_vnd, manualPrice: null };
  });
}

export const purchaseFromDocument: AgentAction = {
  kind: "soan_don_mua_tu_chung_tu", area: "Mua hàng & kho", permissions: ["purchasing.create"],
  description: `Soạn đơn mua (và nhận hàng vào kho nếu nhan_hang=true) từ hóa đơn / phiếu giao hàng của MỘT nhà cung cấp mà người dùng gửi (ảnh, PDF hoặc Excel), tối đa ${PURCHASE_DOC_MAX} dòng. `
    + "Đưa mọi dòng đọc được kèm số lượng và giá in trên chứng từ (số nguyên đồng). Giá lấy theo bảng giá mua; giá chứng từ khác bảng giá chỉ dùng được khi người dùng có quyền quản lý giá mua. "
    + "Chỉ đặt nhan_hang=true khi người dùng nói hàng đã về / muốn nhận luôn.",
  properties: {
    nha_cung_cap: { type: "string", description: "Mã hoặc tên nhà cung cấp trên chứng từ." }, kho: { type: "string", description: "Mã hoặc tên kho nhận; trống = kho đầu tiên." },
    so_chung_tu: { type: "string", description: "Số hóa đơn / phiếu giao; trống nếu không có." }, ngay_nhan: { type: "string", description: "yyyy-mm-dd dự kiến nhận; có thể trống." },
    nhan_hang: { type: "boolean", description: "true = nhận luôn hàng vào kho khi xác nhận." },
    dong: { type: "array", description: "Các dòng hàng theo thứ tự trên chứng từ.", items: { type: "object", additionalProperties: false, required: ["hang", "so_luong"], properties: {
      hang: { type: "string", description: "Mã hoặc tên hàng." }, don_vi: { type: "string", description: "Đơn vị trên chứng từ; trống = đơn vị đã gán cho nhà cung cấp hoặc đơn vị gốc." },
      so_luong: { type: "string", description: "Số lượng, ví dụ 20 hoặc 1.5." }, gia: { type: "string", description: "Đơn giá in trên chứng từ, số nguyên đồng; trống nếu không có." } } } },
  },
  async prepare(context, input) {
    const value = inputSchema.parse(input);
    if (value.nhan_hang && !context.permissions.has("inventory.receive")) throw new ResolveError("Nhận hàng vào kho cần quyền nhận hàng. Đặt nhan_hang=false rồi nhờ người có quyền nhận.");
    if (value.ngay_nhan && !/^\d{4}-\d{2}-\d{2}$/.test(value.ngay_nhan)) throw new ResolveError("Ngày nhận dạng yyyy-mm-dd.");
    const supplier = await findSupplier(context.supabase, context.branchId, value.nha_cung_cap);
    const warehouse = value.kho ? await findWarehouse(context.supabase, context.branchId, value.kho)
      : (await context.supabase.from("warehouses").select("id, code, name").eq("branch_id", context.branchId).eq("active", true).order("code").limit(1)).data?.[0];
    if (!warehouse) throw new ResolveError("Chi nhánh chưa có kho.");
    const [materialResult, unitResult] = await Promise.all([
      context.supabase.from("materials").select("id, code, name, base_uom_id").eq("active", true).eq("purchase_enabled", true).limit(5000),
      context.supabase.from("units_of_measure").select("id, code, name, symbol").limit(1000),
    ]);
    if (materialResult.error || unitResult.error) throw new ResolveError("Chưa đọc được danh mục vật tư. Thử lại.");
    const materials = (materialResult.data ?? []) as Material[];
    const now = new Date().toISOString();
    const [ruleResult, assignmentResult, conversionResult] = await Promise.all([
      context.supabase.from("purchase_price_rules").select("material_id, purchase_uom_id, unit_cost_vnd::text").eq("branch_id", context.branchId).eq("supplier_id", supplier.id).eq("active", true)
        .lte("effective_from", now).or(`effective_to.is.null,effective_to.gt.${now}`).order("version", { ascending: false }).limit(10000),
      context.supabase.from("supplier_materials").select("material_id, purchase_uom_id").eq("supplier_id", supplier.id).eq("active", true).limit(5000),
      materials.length ? context.supabase.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id").in("material_id", materials.slice(0, 1000).map((row) => row.id)).eq("active", true).eq("settlement_allowed", true).limit(5000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ruleResult.error || assignmentResult.error || conversionResult.error) throw new ResolveError("Chưa đọc được giá mua của nhà cung cấp. Thử lại.");
    const canManagePrice = context.permissions.has("purchasing.price.manage");
    const rows = checkPurchaseRows(value.dong, { materials, units: (unitResult.data ?? []) as Unit[], rules: (ruleResult.data ?? []) as unknown as Rule[],
      assignments: (assignmentResult.data ?? []) as Assignment[], conversions: (conversionResult.data ?? []) as Conversion[], canManagePrice });
    const eligible = rows.filter((row) => row.status === "CREATE");
    if (!eligible.length) throw new ResolveError(`Không có dòng nào đặt mua được: ${rows.slice(0, 8).map((row) => `dòng ${row.n} ${row.reason}`).join("; ")}.`);
    const built = await buildWarehouseLines({ supplierId: supplier.id, lines: eligible.map((row) => ({ materialId: row.materialId, orderedUomId: row.uomId, quantity: row.quantity,
      ...(row.manualPrice ? { manualCostVnd: row.manualPrice, manualCostReason: value.so_chung_tu ? `Giá theo chứng từ ${value.so_chung_tu}` : "Giá theo chứng từ nhà cung cấp" } : {}) })) }, context.branchId, canManagePrice);
    eligible.forEach((row, index) => { row.line = built.lines[index] as unknown as Record<string, unknown>; row.total = built.previews[index].lineTotalVnd; row.price = built.previews[index].unitCostVnd; });
    const canSee = context.permissions.has("purchasing.price.read") || canManagePrice;
    return { title: `Tạo đơn mua ${eligible.length} dòng từ ${supplier.name}${value.nhan_hang ? " và nhận hàng" : ""}`,
      payload: { supplierId: supplier.id, warehouseId: warehouse.id, expectedDate: value.ngay_nhan || null, document: value.so_chung_tu, receive: value.nhan_hang, rows, showPrices: canSee },
      summary: [{ label: "Nhà cung cấp", value: supplier.name }, { label: "Kho nhận", value: warehouse.name }, ...(value.so_chung_tu ? [{ label: "Chứng từ", value: value.so_chung_tu }] : []),
        { label: "Nhận hàng luôn", value: value.nhan_hang ? "Có" : "Không (chỉ tạo đơn)" }, ...(canSee ? [{ label: "Tổng tiền", value: formatVnd(vnd(built.totalVnd)) }] : []),
        ...(rows.length > eligible.length ? [{ label: "Bỏ qua", value: `${rows.length - eligible.length} dòng (chưa có giá hoặc không khớp)` }] : [])] };
  },
  view(payload): ListView | null {
    const rows = payload.rows as PurchaseDocRow[] | undefined;
    if (!rows) return null;
    const prices = payload.showPrices !== false;
    return { columns: prices ? ["Vật tư", "Số lượng", "Giá · thành tiền"] : ["Vật tư", "Số lượng"], verb: payload.receive ? "đặt và nhận" : "đặt mua", noun: "dòng", okLabel: payload.receive ? "Đặt + nhận" : "Đặt mua",
      rows: rows.map((row) => ({ n: row.n, status: row.status, ...(row.reason ? { reason: row.reason } : {}),
        cells: [row.label, row.quantity ? `${row.quantity} ${row.unit}`.trim() : "—", ...(prices ? [row.total ? `${vnFormat(row.price)} ₫ · ${vnFormat(row.total)} ₫${row.manualPrice ? " (giá chứng từ)" : ""}` : "—"] : [])] })) };
  },
  async execute(context, payload, actionId, options) {
    const rows = ((payload.rows ?? []) as PurchaseDocRow[]).filter((row) => row.status === "CREATE" && row.line && !options?.exclude?.includes(row.n));
    if (!rows.length) throw new ResolveError("Chưa chọn dòng hàng nào.");
    const { data, error } = await context.supabase.rpc("create_purchase_order_draft", { target_branch_id: context.branchId, target_supplier_id: payload.supplierId, target_warehouse_id: payload.warehouseId,
      expected_at: payload.expectedDate ? new Date(`${payload.expectedDate}T08:00:00+07:00`).toISOString() : null, commercial_terms: payload.document ? `Chứng từ ${payload.document}` : null,
      purchase_lines: rows.map((row) => row.line), operation_id: actionId });
    if (error) throw new Error(error.message);
    const orderId = String(data);
    if (!payload.receive) return { link: `/admin/purchase-orders/${orderId}`, message: `Đã tạo đơn mua ${rows.length} dòng (nhận hàng là xác nhận).` };
    const lineResult = await context.supabase.from("purchase_order_line_read").select("id, quantity").eq("purchase_order_id", orderId).order("line_number");
    if (lineResult.error || !lineResult.data?.length) throw new ResolveError("Đã tạo đơn mua nhưng chưa đọc được các dòng để nhận hàng. Bấm Xác nhận lại.");
    const received = await context.supabase.rpc("receive_purchase_order", { target_purchase_order_id: orderId, target_evidence_id: null, received_at: new Date().toISOString(),
      receipt_lines: lineResult.data.map((line) => ({ purchase_order_line_id: line.id, received_quantity: String(line.quantity) })), operation_id: derivedOperationId(actionId, "receive") });
    if (received.error) throw new ResolveError("Đã tạo đơn mua nhưng chưa nhận được hàng vào kho. Bấm Xác nhận lại để nhận tiếp; đơn không bị tạo lại.");
    return { link: `/admin/purchase-orders/${orderId}`, message: `Đã tạo đơn mua và nhận ${rows.length} dòng hàng vào kho.` };
  },
};
