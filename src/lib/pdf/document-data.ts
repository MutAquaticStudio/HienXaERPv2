import type { BusinessDocumentInput } from "./business-document";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { formatVnd, vnd } from "@/lib/core/money";
import { salesStateLabel } from "@/modules/sales/presentation";
import { purchaseStateLabel } from "@/modules/purchasing/presentation";
import { deliveryStateLabel, sourceModeLabel } from "@/modules/delivery/presentation";

export type CommercialLine = {
  line_number: number; material_name_snapshot: string; quantity: string; ordered_uom_id: string;
  unit_price_vnd?: string; line_total_vnd?: string;
  unit_cost_vnd?: string | null; line_total_cost_vnd?: string | null;
};
export type SalesDocument = {
  id: string; order_number: string; commercial_state: string; customer_name_snapshot: string;
  site_name_snapshot: string; delivery_address_snapshot: string; created_at: string;
  requested_delivery_at: string | null; total_vnd: string;
  receiver_name_snapshot: string | null; receiver_phone_snapshot: string | null;
  commercial_terms: string | null; draft_version: number;
};
export type PurchaseDocument = {
  id: string; purchase_order_number: string; state: string; supplier_name_snapshot: string;
  supplier_address_snapshot: string | null; destination_type: string;
  destination_name_snapshot: string; destination_address_snapshot: string;
  created_at: string; expected_at: string | null; total_cost_vnd: string | null;
  commercial_terms: string | null; draft_version: number;
};
export type DeliveryDocument = {
  id: string; delivery_number: string; execution_state: string; result_kind: string | null;
  customer_name_snapshot: string; site_name_snapshot: string; delivery_address_snapshot: string;
  receiver_name_snapshot: string | null; receiver_phone_snapshot: string | null;
  created_at: string; scheduled_at: string | null; verified_at: string | null;
  reported_result_kind: string | null; reported_receiver_name: string | null; result_note: string | null;
};
export type DeliveryDocumentLine = {
  id: string; material_name_snapshot: string; source_mode: string; base_uom_symbol: string;
  planned_base_quantity: string; loaded_base_quantity: string | null;
  actual_base_quantity: string; accepted_base_quantity: string; billable_base_quantity: string;
};
type Meta = { branch: string; generatedAt: string; sample?: boolean };
const date = (value: string | null) => value ? formatBusinessDateTime(value) : "Chưa hẹn";
const receiver = (name: string | null, phone: string | null) => [name, phone].filter(Boolean).join(" - ") || "Chưa ghi nhận";
const money = (value: string | null | undefined) => value == null ? "Chưa xác định" : formatVnd(vnd(value));
const columns = (prices: boolean): BusinessDocumentInput["columns"] => [
  { label: "STT", key: "number", width: 28 },
  { label: "Vật tư / quy cách", key: "material", width: prices ? 173 : 330 },
  { label: "ĐVT", key: "uom", width: 40 },
  { label: "Số lượng", key: "quantity", width: 70, align: "right" },
  ...(prices ? [
    { label: "Đơn giá (VND)", key: "price", width: 94, align: "right" as const },
    { label: "Thành tiền (VND)", key: "amount", width: 106, align: "right" as const },
  ] : []),
];

export function salesDocumentData(order: SalesDocument, lines: CommercialLine[], symbols: Map<string, string>, meta: Meta): BusinessDocumentInput {
  return {
    ...meta, title: "ĐƠN BÁN HÀNG", reference: order.order_number, sourceId: order.id,
    status: `${salesStateLabel(order.commercial_state)} · Phiên bản lưu ${order.draft_version}`,
    fields: [
      { label: "Khách hàng", value: order.customer_name_snapshot }, { label: "Công trình / điểm giao", value: order.site_name_snapshot },
      { label: "Địa chỉ giao", value: order.delivery_address_snapshot }, { label: "Người nhận / điện thoại", value: receiver(order.receiver_name_snapshot, order.receiver_phone_snapshot) },
      { label: "Ngày lập", value: date(order.created_at) }, { label: "Giao dự kiến", value: date(order.requested_delivery_at) },
    ], columns: columns(true),
    rows: lines.map(l => ({ number: String(l.line_number), material: l.material_name_snapshot, uom: symbols.get(l.ordered_uom_id) ?? "Chưa ghi nhận", quantity: formatQuantity(l.quantity), price: money(l.unit_price_vnd), amount: money(l.line_total_vnd) })),
    totals: [{ label: "Tổng giá trị đơn bán", value: money(order.total_vnd) }],
    notes: [
      { title: "Điều khoản / ghi chú", text: order.commercial_terms || "Chưa ghi điều khoản riêng." },
      { title: "Lưu ý", text: "Giá trị theo đơn đã lưu. Phiếu này không xác nhận khách đã nhận hàng hoặc đã thanh toán." },
    ], signatures: ["Người lập đơn", "Đại diện bên bán", "Đại diện khách hàng"],
  };
}
export function purchaseDocumentData(order: PurchaseDocument, lines: CommercialLine[], symbols: Map<string, string>, prices: boolean, meta: Meta): BusinessDocumentInput {
  return {
    ...meta, title: "ĐƠN ĐẶT HÀNG", reference: order.purchase_order_number, sourceId: order.id,
    status: `${purchaseStateLabel(order.state)} · Phiên bản lưu ${order.draft_version}`,
    fields: [
      { label: "Nhà cung cấp", value: order.supplier_name_snapshot }, { label: "Địa chỉ nhà cung cấp", value: order.supplier_address_snapshot || "Chưa ghi nhận" },
      { label: "Nơi nhận hàng", value: `${order.destination_name_snapshot}\n${purchaseStateLabel(order.destination_type)}` }, { label: "Địa chỉ nhận", value: order.destination_address_snapshot },
      { label: "Ngày lập", value: date(order.created_at) }, { label: "Nhận dự kiến", value: date(order.expected_at) },
    ], columns: columns(prices),
    rows: lines.map(l => ({ number: String(l.line_number), material: l.material_name_snapshot, uom: symbols.get(l.ordered_uom_id) ?? "Chưa ghi nhận", quantity: formatQuantity(l.quantity), ...(prices ? { price: money(l.unit_cost_vnd), amount: money(l.line_total_cost_vnd) } : {}) })),
    totals: prices ? [{ label: "Tổng giá trị đơn mua", value: money(order.total_cost_vnd) }] : [],
    notes: [
      { title: "Điều khoản / ghi chú", text: order.commercial_terms || "Chưa ghi điều khoản riêng." },
      { title: "Lưu ý", text: `${prices ? "Giá mua theo đơn đã lưu." : "Bản không hiển thị giá mua theo quyền truy cập."} Phiếu này không xác nhận đã nhận hàng hoặc đã chi tiền.` },
    ], signatures: ["Người lập đơn", "Đại diện bên mua", "Đại diện nhà cung cấp"],
  };
}
export function deliveryDocumentData(delivery: DeliveryDocument, lines: DeliveryDocumentLine[], meta: Meta): BusinessDocumentInput {
  return {
    ...meta, title: "PHIẾU GIAO HÀNG", reference: delivery.delivery_number, sourceId: delivery.id,
    status: `${deliveryStateLabel(delivery.execution_state)}${delivery.result_kind ? ` · Kết quả: ${deliveryStateLabel(delivery.result_kind)}` : ""}`,
    fields: [
      { label: "Khách hàng", value: delivery.customer_name_snapshot }, { label: "Công trình / điểm giao", value: delivery.site_name_snapshot },
      { label: "Địa chỉ giao", value: delivery.delivery_address_snapshot }, { label: "Người nhận / điện thoại", value: receiver(delivery.receiver_name_snapshot, delivery.receiver_phone_snapshot) },
      { label: "Ngày lập", value: date(delivery.created_at) }, { label: "Lịch giao", value: date(delivery.scheduled_at) },
      { label: "Xác minh trên hệ thống", value: delivery.verified_at ? date(delivery.verified_at) : "Chưa xác minh" },
      { label: "Hiện trường báo", value: delivery.reported_result_kind ? deliveryStateLabel(delivery.reported_result_kind) : "Chưa báo" },
      { label: "Người nhận do hiện trường ghi", value: delivery.reported_receiver_name || "Chưa ghi nhận" },
    ], columns: [
      { label: "STT", key: "number", width: 31 }, { label: "Vật tư / nguồn", key: "material", width: 139 }, { label: "ĐVT", key: "uom", width: 36 },
      { label: "Kế hoạch", key: "planned", width: 61, align: "right" }, { label: "Thực lấy", key: "loaded", width: 61, align: "right" },
      { label: "Báo giao", key: "reported", width: 61, align: "right" }, { label: "Khách nhận", key: "accepted", width: 61, align: "right" },
      { label: "Tính tiền", key: "billable", width: 61, align: "right" },
    ], rows: lines.map((l, i) => ({
      number: String(i + 1), material: `${l.material_name_snapshot}\n${sourceModeLabel(l.source_mode)}`, uom: l.base_uom_symbol,
      planned: formatQuantity(l.planned_base_quantity), loaded: l.loaded_base_quantity == null ? "Chưa lấy" : formatQuantity(l.loaded_base_quantity),
      reported: delivery.reported_result_kind ? formatQuantity(l.actual_base_quantity) : "Chưa báo",
      accepted: delivery.verified_at ? formatQuantity(l.accepted_base_quantity) : "Chưa xác minh",
      billable: delivery.verified_at ? formatQuantity(l.billable_base_quantity) : "Chưa xác minh",
    })), notes: [...(delivery.result_note ? [{ title: "Ghi chú hiện trường đã lưu", text: delivery.result_note }] : []), { title: "Ghi nhận giao nhận", text: "Kế hoạch, thực lấy, hiện trường báo và lượng đã xác minh là các số liệu riêng. Chữ ký trên bản in không tự thay thế bước xác minh hoặc ghi nhận thanh toán trong hệ thống.\nGhi chú giao nhận: ........................................................................................................\n........................................................................................................................................." }],
    signatures: ["Người lập phiếu", "Người giao hàng", "Người nhận hàng"],
  };
}
