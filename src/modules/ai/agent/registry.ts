// FB15 (D37): what the assistant may prepare. Each entry is one tool for Claude: `prepare` looks the things up and checks
// them (prices from the price lists, quantities still open, …) and returns what the card shows plus the exact command
// arguments; `execute` runs the normal database command when the person presses "Xác nhận", under their own session, with
// the action id as the operation id. Nothing here grants anything: the database checks the person's permissions again.
import Decimal from "decimal.js";
import { z } from "zod";

import { derivedOperationId, autoSourceConfirmedOrder } from "@/modules/sales/auto-sourcing";
import { createCommercialLines } from "@/modules/sales/commercial-lines";
import { buildWarehouseLines } from "@/modules/purchasing/warehouse-lines";
import { vietnamInstant } from "@/modules/attendance/presentation";
import { formatVnd, vnd } from "@/lib/core/money";
import {
  findAccount, findCustomer, findDocument, findEmployee, findMaterial, findSite, findSupplier, findUnit, findWarehouse, ResolveError, type Supabase,
} from "./resolve";

export type AgentContext = { supabase: Supabase; branchId: string; permissions: ReadonlySet<string> };
export type SummaryLine = { label: string; value: string };
export type Prepared = { title: string; summary: SummaryLine[]; payload: Record<string, unknown> };
export type Executed = { link?: string; message: string };
export type AgentAction = {
  kind: string;
  area: "Bán hàng" | "Mua hàng & kho" | "Tài chính" | "Nhân sự";
  permissions: readonly string[];
  description: string;
  properties: Record<string, unknown>;
  prepare(context: AgentContext, input: unknown): Promise<Prepared>;
  execute(context: AgentContext, payload: Record<string, unknown>, actionId: string): Promise<Executed>;
};

const money = (value: string | bigint) => formatVnd(vnd(String(value)));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const qty = z.string().trim().regex(/^\d+([.,]\d{1,6})?$/, "Số lượng không hợp lệ.").transform((value) => value.replace(",", "."))
  .refine((value) => Number(value) > 0, "Số lượng phải lớn hơn 0.");
const amount = z.string().trim().transform((value) => value.replace(/[.\s₫đ,]/g, "")).refine((value) => /^[1-9]\d{0,14}$/.test(value), "Số tiền phải là số nguyên dương.");
const dateText = z.string().trim().refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), "Ngày dạng yyyy-mm-dd.");
const lineList = z.array(z.object({ hang: z.string().trim().min(1), don_vi: z.string(), so_luong: qty })).min(1).max(30);
const str = (description: string) => ({ type: "string", description });
const lineProperty = (what: string) => ({ type: "array", description: `Các dòng ${what}.`, items: { type: "object", additionalProperties: false, required: ["hang", "don_vi", "so_luong"],
  properties: { hang: str("Mã hoặc tên hàng."), don_vi: str("Ký hiệu đơn vị (bao, tấn, m³…); để trống = đơn vị gốc."), so_luong: str("Số lượng, ví dụ 20 hoặc 1.5.") } } });

async function rpc(context: AgentContext, name: string, args: Record<string, unknown>) {
  const { data, error } = await context.supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

/** Goods lines for a sale or purchase: the goods, the unit and the quantity, checked one by one. */
async function goodsLines(context: AgentContext, lines: z.infer<typeof lineList>, use: "sale" | "purchase" | "stock") {
  const result = [];
  for (const line of lines) {
    const material = await findMaterial(context.supabase, line.hang, use);
    const unit = await findUnit(context.supabase, line.don_vi, material.base_uom_id);
    result.push({ material, unit, quantity: line.so_luong });
  }
  return result;
}

const createCustomer: AgentAction = {
  kind: "soan_tao_khach_hang", area: "Bán hàng", permissions: ["customers.manage"],
  description: "Soạn tạo khách hàng mới (và công trình giao hàng đầu tiên nếu có địa chỉ).",
  properties: { ten: str("Tên khách hàng."), loai: { type: "string", enum: ["BUSINESS", "INDIVIDUAL"] }, dien_thoai: str("Điện thoại; có thể trống."),
    dia_chi_giao: str("Địa chỉ giao hàng của công trình đầu tiên; có thể trống."), ma: str("Mã khách muốn đặt; trống = tự đặt.") },
  async prepare(context, input) {
    const value = z.object({ ten: z.string().trim().min(2).max(160), loai: z.enum(["BUSINESS", "INDIVIDUAL"]), dien_thoai: z.string().trim().max(30),
      dia_chi_giao: z.string().trim().max(300), ma: z.string().trim().toUpperCase().max(32) }).parse(input);
    const code = value.ma || `KH${Date.now().toString(36).toUpperCase().slice(-6)}`;
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) throw new ResolveError("Mã khách chỉ gồm chữ in hoa, số, - hoặc _.");
    const { data: taken } = await context.supabase.from("customers").select("id").eq("branch_id", context.branchId).ilike("code", code).limit(1);
    if (taken?.length) throw new ResolveError(`Mã khách ${code} đã có. Chọn mã khác.`);
    return { title: `Tạo khách hàng ${value.ten}`, payload: { ...value, code },
      summary: [{ label: "Mã", value: code }, { label: "Loại", value: value.loai === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân" },
        ...(value.dien_thoai ? [{ label: "Điện thoại", value: value.dien_thoai }] : []), ...(value.dia_chi_giao ? [{ label: "Công trình CT1", value: value.dia_chi_giao }] : [])] };
  },
  async execute(context, payload, actionId) {
    const values = { code: payload.code, display_name: payload.ten, customer_type: payload.loai, phone: payload.dien_thoai || null, email: null,
      address_text: payload.dia_chi_giao || null, tax_code: null, sales_owner_employee_id: null, payment_terms_days: "0", internal_note: null, active: true };
    await rpc(context, "save_customer_site_profile", { kind: "customers", target_id: actionId, target_branch_id: context.branchId, values_json: values,
      expected_json: null, change_reason: "Trợ lý AI tạo khách hàng", operation_id: actionId });
    if (payload.dia_chi_giao) {
      const siteId = derivedOperationId(actionId, "site");
      await rpc(context, "save_customer_site_profile", { kind: "sites", target_id: siteId, target_branch_id: context.branchId,
        values_json: { customer_id: actionId, code: "CT1", name: `Công trình ${String(payload.ten).slice(0, 140)}`, address_text: payload.dia_chi_giao, receiver_name: null,
          receiver_phone: payload.dien_thoai || null, sales_owner_employee_id: null, access_note: null, active: true },
        expected_json: null, change_reason: "Trợ lý AI tạo công trình", operation_id: siteId });
    }
    return { link: `/admin/customers/${actionId}`, message: "Đã tạo khách hàng." };
  },
};

const createSalesOrder: AgentAction = {
  kind: "soan_don_ban", area: "Bán hàng", permissions: ["orders.create"],
  description: "Soạn đơn bán (giá theo bảng giá của khách). xac_nhan=true để xác nhận đơn và tự phân nguồn luôn (cần quyền xác nhận đơn).",
  properties: { khach_hang: str("Mã hoặc tên khách."), cong_trinh: str("Mã hoặc tên công trình; trống = công trình đầu tiên."), ngay_giao: str("yyyy-mm-dd; trống = giao ngay."),
    dong_hang: lineProperty("hàng bán"), xac_nhan: { type: "boolean" }, ghi_chu: str("Ghi chú đơn; có thể trống.") },
  async prepare(context, input) {
    const value = z.object({ khach_hang: z.string(), cong_trinh: z.string(), ngay_giao: dateText, dong_hang: lineList, xac_nhan: z.boolean(), ghi_chu: z.string().max(1000) }).parse(input);
    if (value.xac_nhan && !context.permissions.has("orders.confirm")) throw new ResolveError("Người dùng không có quyền xác nhận đơn bán; soạn đơn nháp (xac_nhan=false).");
    const customer = await findCustomer(context.supabase, context.branchId, value.khach_hang);
    const site = await findSite(context.supabase, customer.id, value.cong_trinh);
    const goods = await goodsLines(context, value.dong_hang, "sale");
    const lines = await createCommercialLines({ customerId: customer.id, siteId: site.id, lines: goods.map((line) => ({ materialId: line.material.id, orderedUomId: line.unit.id, quantity: line.quantity })) },
      context.branchId, false);
    const totals = lines.map((line) => new Decimal(line.quantity).mul(String(line.unit_price_vnd)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
    const total = totals.reduce((sum, item) => sum.plus(item), new Decimal(0));
    return { title: `${value.xac_nhan ? "Tạo và xác nhận" : "Tạo"} đơn bán cho ${customer.display_name}`,
      payload: { customerId: customer.id, siteId: site.id, deliveryDate: value.ngay_giao || null, terms: value.ghi_chu, lines, confirm: value.xac_nhan },
      summary: [{ label: "Công trình", value: site.name }, { label: "Giao", value: value.ngay_giao ? value.ngay_giao.split("-").reverse().join("/") : "Ngay" },
        ...goods.map((line, index) => ({ label: `${line.material.code} · ${line.material.name}`, value: `${line.quantity} ${line.unit.symbol} × ${money(String(lines[index].unit_price_vnd))}` })),
        { label: "Tổng tiền", value: money(total.toFixed(0)) }] };
  },
  async execute(context, payload, actionId) {
    const orderId = String(await rpc(context, "create_sales_order_draft", { target_branch_id: context.branchId, target_customer_id: payload.customerId, target_site_id: payload.siteId,
      requested_delivery_at: payload.deliveryDate ? new Date(`${payload.deliveryDate}T08:00:00+07:00`).toISOString() : new Date().toISOString(),
      commercial_terms: payload.terms || null, order_lines: payload.lines, operation_id: actionId }));
    if (!payload.confirm) return { link: `/admin/orders/${orderId}`, message: "Đã tạo đơn bán nháp." };
    const confirmId = derivedOperationId(actionId, "confirm");
    const { error } = await context.supabase.rpc("confirm_sales_order", { target_order_id: orderId, operation_id: confirmId });
    if (error) return { link: `/admin/orders/${orderId}`, message: "Đã tạo đơn nháp nhưng chưa xác nhận được (vượt hạn mức hoặc thiếu điều kiện). Mở đơn để xử lý." };
    await autoSourceConfirmedOrder(context.supabase, context.branchId, orderId, derivedOperationId(confirmId, "auto-source"), { onlyIfEnabled: true }).catch(() => null);
    return { link: `/admin/orders/${orderId}`, message: "Đã tạo và xác nhận đơn bán." };
  },
};

const confirmSalesOrder: AgentAction = {
  kind: "soan_xac_nhan_don_ban", area: "Bán hàng", permissions: ["orders.confirm"],
  description: "Soạn xác nhận một đơn bán nháp (giữ hạn mức, tự phân nguồn).",
  properties: { ma_don: str("Mã đơn bán, ví dụ DB-2026-000041 hoặc 41.") },
  async prepare(context, input) {
    const value = z.object({ ma_don: z.string().min(1) }).parse(input);
    const order = await findDocument(context.supabase, context.branchId, "sales_order_read", "order_number", value.ma_don, "đơn bán");
    if (order.commercial_state !== "DRAFT") throw new ResolveError(`Đơn ${order.order_number} không còn là bản nháp.`);
    return { title: `Xác nhận đơn bán ${order.order_number}`, payload: { orderId: order.id },
      summary: [{ label: "Khách hàng", value: String(order.customer_name_snapshot) }, { label: "Tổng tiền", value: money(String(order.total_vnd)) }] };
  },
  async execute(context, payload, actionId) {
    await rpc(context, "confirm_sales_order", { target_order_id: payload.orderId, operation_id: actionId });
    await autoSourceConfirmedOrder(context.supabase, context.branchId, String(payload.orderId), derivedOperationId(actionId, "auto-source"), { onlyIfEnabled: true }).catch(() => null);
    return { link: `/admin/orders/${payload.orderId}`, message: "Đã xác nhận đơn bán." };
  },
};

type PlanRow = { sales_order_line_id: string; line_number: number; conversion_numerator: string | number; conversion_denominator: string | number;
  required_base_quantity: string | number; allocations: Array<{ consumed_base_quantity: string | number }> };
const createDelivery: AgentAction = {
  kind: "soan_phieu_giao", area: "Bán hàng", permissions: ["delivery.create"],
  description: "Soạn phiếu giao cho toàn bộ phần còn chưa giao của một đơn bán đã xác nhận, xuất từ một kho.",
  properties: { ma_don: str("Mã đơn bán."), kho: str("Mã hoặc tên kho xuất; trống = kho đầu tiên.") },
  async prepare(context, input) {
    const value = z.object({ ma_don: z.string().min(1), kho: z.string() }).parse(input);
    const order = await findDocument(context.supabase, context.branchId, "sales_order_read", "order_number", value.ma_don, "đơn bán");
    if (order.commercial_state !== "CONFIRMED") throw new ResolveError(`Đơn ${order.order_number} chưa được xác nhận.`);
    const warehouse = value.kho ? await findWarehouse(context.supabase, context.branchId, value.kho)
      : (await context.supabase.from("warehouses").select("id, code, name").eq("branch_id", context.branchId).eq("active", true).order("code").limit(1)).data?.[0];
    if (!warehouse) throw new ResolveError("Chi nhánh chưa có kho.");
    const plan = await rpc(context, "order_delivery_plan", { target_sales_order_id: order.id }) as { lines?: PlanRow[] } | null;
    const lines = (plan?.lines ?? []).flatMap((row) => {
      const consumed = row.allocations.reduce((sum, item) => sum.plus(String(item.consumed_base_quantity)), new Decimal(0));
      const remaining = new Decimal(String(row.required_base_quantity)).minus(consumed).mul(String(row.conversion_denominator)).div(String(row.conversion_numerator)).toDecimalPlaces(6, Decimal.ROUND_DOWN);
      return remaining.gt(0) ? [{ sales_order_line_id: row.sales_order_line_id, quantity: remaining.toFixed(), line: row.line_number }] : [];
    });
    if (!lines.length) throw new ResolveError(`Đơn ${order.order_number} không còn hàng chưa giao.`);
    return { title: `Lập phiếu giao cho đơn ${order.order_number}`, payload: { orderId: order.id, warehouseId: warehouse.id, lines: lines.map((line) => ({ sales_order_line_id: line.sales_order_line_id, quantity: line.quantity })) },
      summary: [{ label: "Khách hàng", value: String(order.customer_name_snapshot) }, { label: "Kho xuất", value: warehouse.name },
        ...lines.map((line) => ({ label: `Dòng ${line.line}`, value: `${line.quantity}` }))] };
  },
  async execute(context, payload, actionId) {
    const result = await rpc(context, "create_delivery_for_order", { target_sales_order_id: payload.orderId, target_warehouse_id: payload.warehouseId,
      delivery_lines: payload.lines, scheduled_at: new Date().toISOString(), assignment: null, operation_id: actionId }) as { delivery_id?: string } | null;
    return { link: result?.delivery_id ? `/admin/deliveries/${result.delivery_id}` : `/admin/orders/${payload.orderId}`, message: "Đã lập phiếu giao." };
  },
};

const createPurchaseOrder: AgentAction = {
  kind: "soan_don_mua", area: "Mua hàng & kho", permissions: ["purchasing.create"],
  description: "Soạn đơn mua nhập kho từ một nhà cung cấp (giá theo bảng giá mua của nhà cung cấp).",
  properties: { nha_cung_cap: str("Mã hoặc tên nhà cung cấp."), kho: str("Mã hoặc tên kho nhận; trống = kho đầu tiên."), ngay_nhan: str("yyyy-mm-dd dự kiến; có thể trống."), dong_hang: lineProperty("hàng mua") },
  async prepare(context, input) {
    const value = z.object({ nha_cung_cap: z.string(), kho: z.string(), ngay_nhan: dateText, dong_hang: lineList }).parse(input);
    const supplier = await findSupplier(context.supabase, context.branchId, value.nha_cung_cap);
    const warehouse = value.kho ? await findWarehouse(context.supabase, context.branchId, value.kho)
      : (await context.supabase.from("warehouses").select("id, code, name").eq("branch_id", context.branchId).eq("active", true).order("code").limit(1)).data?.[0];
    if (!warehouse) throw new ResolveError("Chi nhánh chưa có kho.");
    const goods = await goodsLines(context, value.dong_hang, "purchase");
    const built = await buildWarehouseLines({ supplierId: supplier.id, lines: goods.map((line) => ({ materialId: line.material.id, orderedUomId: line.unit.id, quantity: line.quantity })) },
      context.branchId, false);
    const canSee = context.permissions.has("purchasing.price.read");
    return { title: `Tạo đơn mua từ ${supplier.name}`, payload: { supplierId: supplier.id, warehouseId: warehouse.id, expectedDate: value.ngay_nhan || null, lines: built.lines },
      summary: [{ label: "Kho nhận", value: warehouse.name }, ...goods.map((line, index) => ({ label: `${line.material.code} · ${line.material.name}`,
        value: `${line.quantity} ${line.unit.symbol}${canSee ? ` × ${money(built.previews[index].unitCostVnd)}` : ""}` })), ...(canSee ? [{ label: "Tổng tiền", value: money(built.totalVnd) }] : [])] };
  },
  async execute(context, payload, actionId) {
    const id = String(await rpc(context, "create_purchase_order_draft", { target_branch_id: context.branchId, target_supplier_id: payload.supplierId, target_warehouse_id: payload.warehouseId,
      expected_at: payload.expectedDate ? new Date(`${payload.expectedDate}T08:00:00+07:00`).toISOString() : null, commercial_terms: null, purchase_lines: payload.lines, operation_id: actionId }));
    return { link: `/admin/purchase-orders/${id}`, message: "Đã tạo đơn mua (nhận hàng là xác nhận)." };
  },
};

const receivePurchaseOrder: AgentAction = {
  kind: "soan_nhan_hang", area: "Mua hàng & kho", permissions: ["inventory.receive"],
  description: "Soạn nhận đủ phần hàng còn lại của một đơn mua nhập kho.",
  properties: { ma_don: str("Mã đơn mua.") },
  async prepare(context, input) {
    const value = z.object({ ma_don: z.string().min(1) }).parse(input);
    const order = await findDocument(context.supabase, context.branchId, "purchase_order_read", "purchase_order_number", value.ma_don, "đơn mua");
    if (order.destination_type !== "WAREHOUSE" || !["DRAFT", "CONFIRMED"].includes(String(order.state))) throw new ResolveError(`Đơn ${order.purchase_order_number} không nhận hàng vào kho được.`);
    const [lineResult, progressResult] = await Promise.all([
      context.supabase.from("purchase_order_line_read").select("id, material_name_snapshot, quantity").eq("purchase_order_id", order.id).order("line_number"),
      context.supabase.from("purchase_order_line_progress_read").select("purchase_order_line_id, received_quantity").eq("purchase_order_id", order.id),
    ]);
    if (lineResult.error || progressResult.error) throw new ResolveError("Không đọc được dòng đơn mua.");
    const received = new Map((progressResult.data ?? []).map((row) => [row.purchase_order_line_id, String(row.received_quantity ?? "0")]));
    const lines = (lineResult.data ?? []).flatMap((line) => {
      const remaining = new Decimal(String(line.quantity)).minus(received.get(line.id) ?? "0");
      return remaining.gt(0) ? [{ purchase_order_line_id: line.id, received_quantity: remaining.toFixed(), name: String(line.material_name_snapshot) }] : [];
    });
    if (!lines.length) throw new ResolveError(`Đơn ${order.purchase_order_number} đã nhận đủ.`);
    return { title: `Nhận hàng đơn mua ${order.purchase_order_number}`, payload: { orderId: order.id, lines: lines.map((line) => ({ purchase_order_line_id: line.purchase_order_line_id, received_quantity: line.received_quantity })) },
      summary: [{ label: "Nhà cung cấp", value: String(order.supplier_name_snapshot) }, ...lines.map((line) => ({ label: line.name, value: line.received_quantity }))] };
  },
  async execute(context, payload, actionId) {
    await rpc(context, "receive_purchase_order", { target_purchase_order_id: payload.orderId, receipt_lines: payload.lines, target_evidence_id: null,
      received_at: new Date().toISOString(), operation_id: actionId });
    return { link: `/admin/purchase-orders/${payload.orderId}`, message: "Đã nhận hàng vào kho." };
  },
};

const transferStock: AgentAction = {
  kind: "soan_chuyen_kho", area: "Mua hàng & kho", permissions: ["inventory.reserve"],
  description: "Soạn phiếu chuyển hàng giữa hai kho; xuat_ngay=true để xuất kho luôn.",
  properties: { tu_kho: str("Kho chuyển."), den_kho: str("Kho nhận."), dong_hang: lineProperty("hàng chuyển"), xuat_ngay: { type: "boolean" } },
  async prepare(context, input) {
    const value = z.object({ tu_kho: z.string(), den_kho: z.string(), dong_hang: lineList, xuat_ngay: z.boolean() }).parse(input);
    const from = await findWarehouse(context.supabase, context.branchId, value.tu_kho);
    const to = await findWarehouse(context.supabase, context.branchId, value.den_kho);
    if (from.id === to.id) throw new ResolveError("Kho chuyển và kho nhận phải khác nhau.");
    const goods = await goodsLines(context, value.dong_hang, "stock");
    return { title: `Chuyển hàng ${from.name} → ${to.name}`, payload: { fromId: from.id, toId: to.id, shipNow: value.xuat_ngay,
      lines: goods.map((line) => ({ material_id: line.material.id, uom_id: line.unit.id, quantity: line.quantity })) },
      summary: [...goods.map((line) => ({ label: `${line.material.code} · ${line.material.name}`, value: `${line.quantity} ${line.unit.symbol}` })),
        { label: "Xuất kho ngay", value: value.xuat_ngay ? "Có" : "Không" }] };
  },
  async execute(context, payload, actionId) {
    await rpc(context, "create_warehouse_transfers", { target_branch_id: context.branchId, from_warehouse_id: payload.fromId, to_warehouse_id: payload.toId,
      transfer_lines: payload.lines, ship_now: payload.shipNow, transfer_note: "Trợ lý AI", operation_id: actionId });
    return { link: "/admin/inventory/transfers", message: "Đã tạo phiếu chuyển kho." };
  },
};

const receivePayment: AgentAction = {
  kind: "soan_thu_tien", area: "Tài chính", permissions: ["finance.payment.post", "finance.ar.read"],
  description: "Soạn phiếu thu tiền khách; tiền trừ vào các khoản nợ cũ nhất trước, phần dư ghi trả trước.",
  properties: { khach_hang: str("Mã hoặc tên khách."), so_tien: str("Số tiền VND."), quy: str("Mã hoặc tên quỹ / tài khoản; trống = quỹ đầu tiên."),
    phuong_thuc: { type: "string", enum: ["CASH", "BANK_TRANSFER"] }, tham_chieu: str("Nội dung / số chứng từ; có thể trống.") },
  async prepare(context, input) {
    const value = z.object({ khach_hang: z.string(), so_tien: amount, quy: z.string(), phuong_thuc: z.enum(["CASH", "BANK_TRANSFER"]), tham_chieu: z.string().max(160) }).parse(input);
    const customer = await findCustomer(context.supabase, context.branchId, value.khach_hang);
    const account = value.quy ? await findAccount(context.supabase, context.branchId, value.quy)
      : (await context.supabase.from("finance_accounts").select("id, code, name").eq("branch_id", context.branchId).eq("active", true).order("code").limit(1)).data?.[0];
    if (!account) throw new ResolveError("Chi nhánh chưa có quỹ / tài khoản.");
    const { data: debts, error } = await context.supabase.from("receivable_read").select("id, outstanding_amount_vnd::text, due_date, source_label")
      .eq("branch_id", context.branchId).eq("customer_id", customer.id).gt("outstanding_amount_vnd", 0).order("due_date").limit(50);
    if (error) throw new ResolveError("Không đọc được công nợ của khách.");
    let left = BigInt(value.so_tien);
    const allocations: Array<{ obligation_id: string; amount_vnd: string }> = [];
    for (const debt of debts ?? []) {
      if (left <= 0n) break;
      const take = BigInt(debt.outstanding_amount_vnd) < left ? BigInt(debt.outstanding_amount_vnd) : left;
      allocations.push({ obligation_id: debt.id, amount_vnd: take.toString() });
      left -= take;
    }
    return { title: `Thu ${money(value.so_tien)} của ${customer.display_name}`, payload: { customerId: customer.id, accountId: account.id, amount: value.so_tien,
      method: value.phuong_thuc, reference: value.tham_chieu, allocations, advance: left.toString() },
      summary: [{ label: "Vào quỹ", value: account.name }, { label: "Hình thức", value: value.phuong_thuc === "CASH" ? "Tiền mặt" : "Chuyển khoản" },
        { label: "Trừ nợ", value: `${allocations.length} khoản · ${money((BigInt(value.so_tien) - left).toString())}` }, ...(left > 0n ? [{ label: "Ghi trả trước", value: money(left) }] : [])] };
  },
  async execute(context, payload, actionId) {
    await rpc(context, "post_payment", { target_branch_id: context.branchId, direction: "RECEIPT", target_customer_id: payload.customerId, target_supplier_id: null,
      target_account_id: payload.accountId, amount_vnd: payload.amount, effective_at: new Date().toISOString(), method: payload.method, external_reference: payload.reference || "",
      allocation_lines: payload.allocations, advance_amount_vnd: payload.advance, operation_id: actionId });
    return { link: "/admin/cashbook", message: "Đã ghi phiếu thu vào Sổ quỹ." };
  },
};

const recordExpense: AgentAction = {
  kind: "soan_chi_phi", area: "Tài chính", permissions: ["finance.expense.manage"],
  description: "Soạn ghi chi phí đã trả ngay từ một quỹ (ghi phiếu chi vào Sổ quỹ).",
  properties: { loai_chi: str("Loại chi, ví dụ Điện nước, Sửa chữa."), so_tien: str("Số tiền VND."), nguoi_nhan: str("Người / nơi nhận tiền."),
    quy: str("Mã hoặc tên quỹ; trống = quỹ đầu tiên."), ghi_chu: str("Ghi chú; có thể trống.") },
  async prepare(context, input) {
    const value = z.object({ loai_chi: z.string().trim().min(2).max(120), so_tien: amount, nguoi_nhan: z.string().trim().min(1).max(160), quy: z.string(), ghi_chu: z.string().max(500) }).parse(input);
    const account = value.quy ? await findAccount(context.supabase, context.branchId, value.quy)
      : (await context.supabase.from("finance_accounts").select("id, code, name").eq("branch_id", context.branchId).eq("active", true).order("code").limit(1)).data?.[0];
    if (!account) throw new ResolveError("Chi nhánh chưa có quỹ / tài khoản.");
    return { title: `Ghi chi ${money(value.so_tien)} · ${value.loai_chi}`, payload: { ...value, accountId: account.id },
      summary: [{ label: "Người nhận", value: value.nguoi_nhan }, { label: "Chi từ quỹ", value: account.name }, ...(value.ghi_chu ? [{ label: "Ghi chú", value: value.ghi_chu }] : [])] };
  },
  async execute(context, payload, actionId) {
    await rpc(context, "record_operating_expense", { target_branch_id: context.branchId, target_category_id: null, new_category_name: payload.loai_chi, amount_vnd: payload.so_tien,
      effective_at: new Date().toISOString(), payee_kind: "OTHER", target_supplier_id: null, target_employee_id: null, payee_name: payload.nguoi_nhan, settlement: "PAID_NOW",
      target_account_id: payload.accountId, counts_in_profit: true, description: payload.ghi_chu || null, target_sales_order_id: null, operation_id: actionId });
    return { link: "/admin/expenses", message: "Đã ghi chi phí và phiếu chi." };
  },
};

const ATTENDANCE_LABELS: Record<string, string> = { WORKED: "Đi làm", LEAVE_PAID: "Nghỉ có phép", LEAVE_UNPAID: "Nghỉ không phép", ABSENT: "Vắng" };
const saveAttendance: AgentAction = {
  kind: "soan_cham_cong", area: "Nhân sự", permissions: ["attendance.manage"],
  description: "Soạn chấm công hộ một nhân viên một ngày.",
  properties: { nhan_vien: str("Mã hoặc tên nhân viên."), ngay: str("yyyy-mm-dd; trống = hôm nay."), trang_thai: { type: "string", enum: Object.keys(ATTENDANCE_LABELS) },
    gio_vao: str("HH:MM khi đi làm; có thể trống."), gio_ra: str("HH:MM; có thể trống.") },
  async prepare(context, input) {
    const time = z.string().trim().refine((value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), "Giờ dạng HH:MM.");
    const value = z.object({ nhan_vien: z.string(), ngay: dateText, trang_thai: z.enum(["WORKED", "LEAVE_PAID", "LEAVE_UNPAID", "ABSENT"]), gio_vao: time, gio_ra: time }).parse(input);
    if (value.trang_thai === "WORKED" && !value.gio_vao) throw new ResolveError("Chấm đi làm cần giờ vào.");
    const employee = await findEmployee(context.supabase, context.branchId, value.nhan_vien);
    const day = value.ngay || today();
    return { title: `Chấm công ${employee.display_name} ngày ${day.split("-").reverse().join("/")}`, payload: { employeeId: employee.id, day, ...value },
      summary: [{ label: "Trạng thái", value: ATTENDANCE_LABELS[value.trang_thai] }, ...(value.trang_thai === "WORKED" ? [{ label: "Giờ", value: `${value.gio_vao}${value.gio_ra ? ` – ${value.gio_ra}` : ""}` }] : [])] };
  },
  async execute(context, payload, actionId) {
    const day = String(payload.day);
    const clockIn = payload.trang_thai === "WORKED" && payload.gio_vao ? vietnamInstant(day, String(payload.gio_vao)) : null;
    const clockOut = payload.trang_thai === "WORKED" && payload.gio_ra ? vietnamInstant(day, String(payload.gio_ra), clockIn ?? undefined) : null;
    await rpc(context, "save_attendance", { target_branch_id: context.branchId, target_employee_id: payload.employeeId, day, target_shift_id: null,
      day_status: payload.trang_thai, clock_in: clockIn, clock_out: clockOut, day_note: "Trợ lý AI", operation_id: actionId });
    return { link: "/admin/attendance", message: "Đã lưu chấm công." };
  },
};

const adjustPayroll: AgentAction = {
  kind: "soan_cong_tru_luong", area: "Nhân sự", permissions: ["compensation.manage"],
  description: "Soạn cộng / trừ tay trên phiếu lương của một nhân viên trong bảng lương tạm tính gần nhất (đặt lại số cộng và số trừ).",
  properties: { nhan_vien: str("Mã hoặc tên nhân viên."), cong: str("Số tiền cộng (thưởng); 0 nếu không."), tru: str("Số tiền trừ (tạm ứng…); 0 nếu không."), ghi_chu: str("Lý do.") },
  async prepare(context, input) {
    const money0 = z.string().trim().transform((value) => value.replace(/[.\s₫đ,]/g, "") || "0").refine((value) => /^\d{1,15}$/.test(value), "Số tiền không hợp lệ.");
    const value = z.object({ nhan_vien: z.string(), cong: money0, tru: money0, ghi_chu: z.string().max(300) }).parse(input);
    const employee = await findEmployee(context.supabase, context.branchId, value.nhan_vien);
    const { data: period } = await context.supabase.from("payroll_periods").select("id, code, name").eq("branch_id", context.branchId).eq("state", "DRAFT").order("period_start", { ascending: false }).limit(1).maybeSingle();
    if (!period) throw new ResolveError("Không có bảng lương tạm tính nào.");
    const { data: line } = await context.supabase.from("payroll_lines").select("id").eq("payroll_period_id", period.id).eq("employee_id", employee.id).eq("included", true).maybeSingle();
    if (!line) throw new ResolveError(`${employee.display_name} không có phiếu lương trong ${period.name}.`);
    return { title: `Cộng / trừ lương ${employee.display_name}`, payload: { lineId: line.id, periodId: period.id, bonus: value.cong, deduction: value.tru, note: value.ghi_chu },
      summary: [{ label: "Bảng lương", value: `${period.code} · ${period.name}` }, { label: "Cộng tay", value: money(value.cong) }, { label: "Trừ tay", value: money(value.tru) },
        ...(value.ghi_chu ? [{ label: "Ghi chú", value: value.ghi_chu }] : [])] };
  },
  async execute(context, payload, actionId) {
    await rpc(context, "adjust_payroll_line", { target_line_id: payload.lineId, bonus: payload.bonus, deduction: payload.deduction, note: payload.note || null, operation_id: actionId });
    return { link: `/admin/payroll/${payload.periodId}`, message: "Đã cập nhật cộng / trừ trên phiếu lương." };
  },
};

const sendMessage: AgentAction = {
  kind: "soan_nhan_tin", area: "Nhân sự", permissions: [],
  description: "Soạn tin nhắn gửi một người trong danh bạ Tin nhắn của người dùng.",
  properties: { nguoi_nhan: str("Tên người nhận."), noi_dung: str("Nội dung tin nhắn.") },
  async prepare(context, input) {
    const value = z.object({ nguoi_nhan: z.string().trim().min(1), noi_dung: z.string().trim().min(1).max(4000) }).parse(input);
    const { data, error } = await context.supabase.rpc("messenger_contacts", { target_branch_id: context.branchId, target_customer_id: null });
    if (error) throw new ResolveError("Không đọc được danh bạ.");
    const text = value.nguoi_nhan.toLocaleLowerCase("vi-VN");
    const found = ((data ?? []) as Array<{ auth_user_id: string; display_name: string; customer_id: string | null }>).filter((contact) => contact.display_name.toLocaleLowerCase("vi-VN").includes(text));
    if (found.length !== 1) throw new ResolveError(found.length ? `Có nhiều người tên "${value.nguoi_nhan}": ${found.map((contact) => contact.display_name).join("; ")}.` : `Không có "${value.nguoi_nhan}" trong danh bạ.`);
    return { title: `Nhắn tin cho ${found[0].display_name}`, payload: { contactId: found[0].auth_user_id, customerId: found[0].customer_id, body: value.noi_dung },
      summary: [{ label: "Nội dung", value: value.noi_dung }] };
  },
  async execute(context, payload, actionId) {
    const conversation = await rpc(context, "open_direct_conversation", { target_branch_id: context.branchId, target_customer_id: null,
      contact_auth_user_id: payload.contactId, contact_customer_id: payload.customerId ?? null });
    await rpc(context, "send_message", { target_conversation_id: conversation, target_body: payload.body, operation_id: actionId });
    return { link: `/admin/messages?conversation=${conversation}`, message: "Đã gửi tin nhắn." };
  },
};

export const AGENT_ACTIONS: readonly AgentAction[] = [createCustomer, createSalesOrder, confirmSalesOrder, createDelivery, createPurchaseOrder,
  receivePurchaseOrder, transferStock, receivePayment, recordExpense, saveAttendance, adjustPayroll, sendMessage];

export const agentActionOf = (kind: string) => AGENT_ACTIONS.find((action) => action.kind === kind);
export const canUseAction = (action: AgentAction, permissions: ReadonlySet<string>) => action.permissions.every((permission) => permissions.has(permission));
