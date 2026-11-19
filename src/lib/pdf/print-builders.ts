// D52: what each printed document says, from data the routes have read. Pure functions (no database), tested on their own.
import Decimal from "decimal.js";

import type { CompanyHeading } from "@/lib/company/profile";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { bankTransferNote } from "@/modules/finance/transfer-note";
import { deliveryStateLabel } from "@/modules/delivery/presentation";
import { purchaseStateLabel } from "@/modules/purchasing/presentation";
import { salesStateLabel } from "@/modules/sales/presentation";
import type { Paper, PrintDocumentInput, PrintLine } from "./print-document";

export type PrintBank = { bankName: string; accountNumber: string; holder: string; prefix: string | null };
export type PrintDebt = { id: string; sales_order_id: string | null; outstanding_amount_vnd: string; original_amount_vnd: string; due_date: string; state: string;
  site_name: string | null; recorded_at: string };
type Common = { paper: Paper; company: CompanyHeading; printedAt: string; qrImage?: Uint8Array | null };

const money = (value: string | bigint) => formatVnd(vnd(String(value)));
const plain = (value: string | bigint | null | undefined) => value == null ? "" : new Intl.NumberFormat("vi-VN").format(BigInt(String(value)));
const when = (value: string | null | undefined) => value ? formatBusinessDateTime(value) : "Chưa hẹn";
const issued = (value: string) => `Ngày ${formatBusinessDateTime(value)}`;
const footnote = (printedAt: string) => `In lúc ${formatBusinessDateTime(printedAt)} · Hiền Xa ERP`;
const sum = (values: readonly string[]) => values.reduce((total, value) => total + BigInt(value), 0n);

/** The QR block: the caption names the bank, account, amount and the transfer note SePay matches. */
function qrBlock(bank: PrintBank | null, image: Uint8Array | null | undefined, amount: bigint, note: string) {
  if (!bank || amount <= 0n) return null;
  return { image: image ?? new Uint8Array(), caption: ["Quét mã để chuyển khoản", `${bank.bankName} · ${bank.accountNumber}`, ...(bank.holder ? [bank.holder] : []),
    `Số tiền: ${money(amount)}`, `Nội dung: ${note}`] };
}

// ---------------------------------------------------------------------------------------------------------------- sales
export type SalesPrintLine = { line_number: number; material_name_snapshot: string; quantity: string; unit: string; unit_price_vnd: string; line_total_vnd: string;
  list_unit_price_vnd?: string | null; discount_mode?: string | null; discount_value?: string | null };
export type SalesPrintOrder = { id: string; order_number: string; commercial_state: string; customer_name_snapshot: string; site_name_snapshot: string;
  delivery_address_snapshot: string; created_at: string; confirmed_at?: string | null; requested_delivery_at: string | null; total_vnd: string;
  receiver_name_snapshot: string | null; receiver_phone_snapshot: string | null; commercial_terms: string | null };

/**
 * What the customer still owes for this order and before it:
 * - before any delivery there is no debt yet: the order is owed in full, less what was paid in advance;
 * - after deliveries: what is still open on this order's debts plus the value not delivered yet.
 * "Nợ cũ" is every other open debt of the customer at the time of printing.
 */
export function salesDebt(order: Pick<SalesPrintOrder, "id" | "total_vnd">, prepaidVnd: bigint, debts: readonly PrintDebt[]) {
  const mine = debts.filter((row) => row.sales_order_id === order.id);
  const total = BigInt(order.total_vnd);
  const delivered = sum(mine.map((row) => row.original_amount_vnd));
  const owed = mine.length
    ? sum(mine.map((row) => row.outstanding_amount_vnd)) + (total > delivered ? total - delivered : 0n)
    : (total > prepaidVnd ? total - prepaidVnd : 0n);
  const paid = total > owed ? total - owed : 0n;
  const previous = sum(debts.filter((row) => row.sales_order_id !== order.id).map((row) => row.outstanding_amount_vnd));
  return { total, paid, owed, previous, all: previous + owed };
}

function discountNote(line: SalesPrintLine) {
  if (!line.list_unit_price_vnd) return "";
  const typed = line.discount_mode === "PERCENT" && line.discount_value ? ` · giảm ${new Decimal(line.discount_value).toString().replace(".", ",")}%` : "";
  return ` (giá gốc ${plain(line.list_unit_price_vnd)}${typed})`;
}

export function salesPrint(input: Common & { order: SalesPrintOrder; lines: SalesPrintLine[]; customer: { code: string; phone: string | null } | null;
  seller: string | null; prepaidVnd: bigint; debts: PrintDebt[] | null; bank: PrintBank | null }): PrintDocumentInput {
  const { order } = input;
  const gross = input.lines.reduce((total, line) => total + BigInt(new Decimal(line.quantity).mul(line.list_unit_price_vnd ?? line.unit_price_vnd)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)), 0n);
  const debt = salesDebt(order, input.prepaidVnd, input.debts ?? []);
  // A discount line only when a line was sold below its list price (as on the order screen).
  const discounted = input.lines.some((line) => line.list_unit_price_vnd) && gross > debt.total;
  const totals: PrintLine[] = [
    { label: "Tổng tiền hàng", value: money(discounted ? gross : debt.total) },
    ...(discounted ? [{ label: "Giảm giá", value: `−${money(gross - debt.total)}` }] : []),
    { label: "Tổng thanh toán", value: money(debt.total), strong: !input.debts },
    ...(input.debts ? [
      ...(debt.paid > 0n ? [{ label: "Khách đã trả", value: money(debt.paid) }] : []),
      { label: "Còn phải trả", value: money(debt.owed), strong: true },
      { label: "Nợ cũ", value: money(debt.previous) },
      { label: "Tổng nợ", value: money(debt.all), strong: true },
    ] : []),
  ];
  const note = bankTransferNote(input.bank?.prefix, order.order_number, input.customer?.code);
  const draft = order.commercial_state === "DRAFT";
  return {
    paper: input.paper, title: draft ? "ĐƠN BÁN HÀNG (NHÁP)" : "ĐƠN BÁN HÀNG", reference: order.order_number, company: input.company,
    issuedAt: issued(order.confirmed_at ?? order.created_at), status: draft ? "Bản nháp — chưa xác nhận" : salesStateLabel(order.commercial_state),
    info: [
      { label: "Khách hàng", value: order.customer_name_snapshot }, { label: "Mã KH", value: input.customer?.code ?? "—" },
      { label: "Công trình", value: order.site_name_snapshot }, { label: "Điện thoại", value: input.customer?.phone ?? "—" },
      { label: "Địa chỉ giao", value: order.delivery_address_snapshot }, { label: "Giao dự kiến", value: when(order.requested_delivery_at) },
      { label: "Người nhận", value: [order.receiver_name_snapshot, order.receiver_phone_snapshot].filter(Boolean).join(" · ") || "—" },
      ...(input.seller ? [{ label: "NV bán hàng", value: input.seller }] : []),
    ],
    columns: [{ label: "STT", key: "n", width: 28, align: "center" }, { label: "Tên hàng", key: "name", width: 190 }, { label: "ĐVT", key: "unit", width: 40, align: "center" },
      { label: "SL", key: "qty", width: 50, align: "right" }, { label: "Đơn giá", key: "price", width: 80, align: "right" }, { label: "Thành tiền", key: "amount", width: 92, align: "right" }],
    rows: input.lines.map((line) => ({ n: String(line.line_number), name: `${line.material_name_snapshot}${discountNote(line)}`, unit: line.unit, qty: formatQuantity(line.quantity),
      price: plain(line.unit_price_vnd), amount: plain(line.line_total_vnd) })),
    items: input.lines.map((line) => ({ name: line.material_name_snapshot, quantity: formatQuantity(line.quantity), unit: line.unit, price: plain(line.unit_price_vnd),
      amount: plain(line.line_total_vnd), note: line.list_unit_price_vnd ? discountNote(line).trim() : undefined })),
    emptyText: "Chưa có dòng hàng.", totals,
    qr: draft ? null : qrBlock(input.bank, input.qrImage, input.debts ? debt.owed : debt.total, note),
    notes: [{ title: "Ghi chú", text: order.commercial_terms ?? "" }],
    signatures: ["Khách hàng", "Người giao hàng", "Người lập phiếu"], thanks: "Cảm ơn quý khách đã mua hàng!", footnote: footnote(input.printedAt),
  };
}

// ------------------------------------------------------------------------------------------------------------- delivery
export type DeliveryPrintLine = { material_name_snapshot: string; unit: string; planned_base_quantity: string; accepted_base_quantity: string | null };
export type DeliveryPrintNote = { delivery_number: string; execution_state: string; result_kind: string | null; customer_name_snapshot: string; site_name_snapshot: string;
  delivery_address_snapshot: string; receiver_name_snapshot: string | null; receiver_phone_snapshot: string | null; created_at: string; scheduled_at: string | null;
  verified_at: string | null };

export function deliveryPrint(input: Common & { delivery: DeliveryPrintNote; lines: DeliveryPrintLine[]; orderNumber: string | null; driver: string | null;
  customerPhone: string | null }): PrintDocumentInput {
  const { delivery } = input;
  const verified = Boolean(delivery.verified_at);
  return {
    paper: input.paper, title: "PHIẾU GIAO HÀNG", reference: delivery.delivery_number, company: input.company, issuedAt: issued(delivery.scheduled_at ?? delivery.created_at),
    status: `${deliveryStateLabel(delivery.execution_state)}${delivery.result_kind ? ` · ${deliveryStateLabel(delivery.result_kind)}` : ""}`,
    info: [
      { label: "Khách hàng", value: delivery.customer_name_snapshot }, { label: "Điện thoại", value: input.customerPhone ?? "—" },
      { label: "Công trình", value: delivery.site_name_snapshot }, { label: "Đơn bán", value: input.orderNumber ?? "—" },
      { label: "Địa chỉ giao", value: delivery.delivery_address_snapshot }, { label: "Lịch giao", value: when(delivery.scheduled_at) },
      { label: "Người nhận", value: [delivery.receiver_name_snapshot, delivery.receiver_phone_snapshot].filter(Boolean).join(" · ") || "—" },
      { label: "Người giao / xe", value: input.driver ?? "—" },
    ],
    columns: [{ label: "STT", key: "n", width: 28, align: "center" }, { label: "Tên hàng", key: "name", width: 210 }, { label: "ĐVT", key: "unit", width: 44, align: "center" },
      { label: "SL giao", key: "planned", width: 64, align: "right" }, { label: "Khách nhận", key: "accepted", width: 70, align: "right" }, { label: "Ghi chú", key: "note", width: 84 }],
    rows: input.lines.map((line, index) => ({ n: String(index + 1), name: line.material_name_snapshot, unit: line.unit, planned: formatQuantity(line.planned_base_quantity),
      accepted: verified && line.accepted_base_quantity != null ? formatQuantity(line.accepted_base_quantity) : "", note: "" })),
    items: input.lines.map((line) => ({ name: line.material_name_snapshot, quantity: formatQuantity(line.planned_base_quantity), unit: line.unit })),
    emptyText: "Chưa có dòng hàng.",
    notes: [{ title: "Lưu ý", text: "Quý khách kiểm đếm hàng khi nhận, ghi số lượng thực nhận và ký xác nhận. Hàng thiếu / hỏng xin ghi rõ vào cột Ghi chú." }],
    signatures: ["Người nhận hàng", "Người giao hàng", "Người lập phiếu"], footnote: footnote(input.printedAt),
  };
}

// ------------------------------------------------------------------------------------------------------------- purchase
export type PurchasePrintOrder = { purchase_order_number: string; state: string; supplier_name_snapshot: string; supplier_address_snapshot: string | null;
  destination_type: string; destination_name_snapshot: string; destination_address_snapshot: string; created_at: string; expected_at: string | null;
  total_cost_vnd: string | null; commercial_terms: string | null };
export type PurchasePrintLine = { line_number: number; material_name_snapshot: string; quantity: string; unit: string; unit_cost_vnd: string | null; line_total_cost_vnd: string | null };

export function purchasePrint(input: Common & { order: PurchasePrintOrder; lines: PurchasePrintLine[]; prices: boolean; supplierPhone: string | null }): PrintDocumentInput {
  const { order } = input;
  return {
    paper: input.paper, title: "ĐƠN ĐẶT HÀNG", reference: order.purchase_order_number, company: input.company, issuedAt: issued(order.created_at),
    status: purchaseStateLabel(order.state),
    info: [
      { label: "Nhà cung cấp", value: order.supplier_name_snapshot }, { label: "Điện thoại", value: input.supplierPhone ?? "—" },
      { label: "Địa chỉ NCC", value: order.supplier_address_snapshot ?? "—" }, { label: "Nhận dự kiến", value: when(order.expected_at) },
      { label: "Giao tới", value: `${order.destination_name_snapshot} (${purchaseStateLabel(order.destination_type)})` }, { label: "Địa chỉ nhận", value: order.destination_address_snapshot },
    ],
    columns: [{ label: "STT", key: "n", width: 28, align: "center" }, { label: "Tên hàng", key: "name", width: input.prices ? 190 : 330 }, { label: "ĐVT", key: "unit", width: 40, align: "center" },
      { label: "SL", key: "qty", width: 56, align: "right" },
      ...(input.prices ? [{ label: "Đơn giá", key: "price", width: 80, align: "right" as const }, { label: "Thành tiền", key: "amount", width: 92, align: "right" as const }] : [])],
    rows: input.lines.map((line) => ({ n: String(line.line_number), name: line.material_name_snapshot, unit: line.unit, qty: formatQuantity(line.quantity),
      ...(input.prices ? { price: plain(line.unit_cost_vnd), amount: plain(line.line_total_cost_vnd) } : {}) })),
    emptyText: "Chưa có dòng hàng.",
    totals: input.prices && order.total_cost_vnd ? [{ label: "Tổng giá trị đơn đặt", value: money(order.total_cost_vnd), strong: true }] : [],
    notes: [{ title: "Điều khoản", text: order.commercial_terms ?? "" }],
    signatures: ["Đại diện nhà cung cấp", "Người lập đơn"], footnote: footnote(input.printedAt),
  };
}

// -------------------------------------------------------------------------------------------------------------- payment
export type PaymentPrint = { payment_number: string; direction: "RECEIPT" | "DISBURSEMENT"; counterparty_name: string; account_name: string | null; account_code: string;
  account_kind: string | null; amount_vnd: string; advance_amount_vnd: string; method: string | null; effective_at: string; posting_state: string;
  reversal_of_payment_id: string | null; external_reference: string | null };
export type PaymentPrintAllocation = { label: string; due_date: string | null; amount_vnd: string };
const METHOD: Record<string, string> = { CASH: "Tiền mặt", BANK_TRANSFER: "Chuyển khoản", CARD: "Thẻ", OTHER: "Khác" };

export function paymentPrint(input: Common & { payment: PaymentPrint; allocations: PaymentPrintAllocation[]; customerCode: string | null;
  outstandingVnd: string | null }): PrintDocumentInput {
  const { payment } = input;
  const receipt = payment.direction === "RECEIPT";
  const reversed = payment.posting_state === "REVERSED" || Boolean(payment.reversal_of_payment_id);
  const reason = input.allocations.length ? `Thanh toán ${input.allocations.map((row) => row.label).slice(0, 4).join("; ")}${input.allocations.length > 4 ? "…" : ""}`
    : BigInt(payment.advance_amount_vnd) > 0n ? "Tiền ứng trước" : (payment.external_reference ?? "—");
  return {
    paper: input.paper, title: receipt ? "PHIẾU THU" : "PHIẾU CHI", reference: payment.payment_number, company: input.company, issuedAt: issued(payment.effective_at),
    status: reversed ? (payment.reversal_of_payment_id ? "Giao dịch đảo" : "Đã đảo giao dịch") : undefined,
    info: [
      { label: receipt ? "Người nộp tiền" : "Người nhận tiền", value: `${payment.counterparty_name}${input.customerCode ? ` (${input.customerCode})` : ""}` },
      { label: "Hình thức", value: [METHOD[payment.method ?? ""] ?? payment.method, payment.account_name ?? payment.account_code].filter(Boolean).join(" · ") },
      { label: receipt ? "Lý do nộp" : "Lý do chi", value: reason }, { label: receipt ? "Ngày thu" : "Ngày chi", value: formatBusinessDateTime(payment.effective_at) },
    ],
    columns: input.allocations.length ? [{ label: receipt ? "Trả cho khoản" : "Chi cho khoản", key: "label", width: 300 }, { label: "Hạn", key: "due", width: 90, align: "center" },
      { label: "Số tiền", key: "amount", width: 110, align: "right" }] : [],
    rows: input.allocations.map((row) => ({ label: row.label, due: row.due_date ? formatBusinessDate(row.due_date) : "—", amount: plain(row.amount_vnd) })),
    items: input.allocations.map((row) => ({ name: row.label, quantity: "", unit: row.due_date ? `hạn ${formatBusinessDate(row.due_date)}` : "", amount: plain(row.amount_vnd) })),
    totals: [
      { label: receipt ? "Số tiền thu" : "Số tiền chi", value: money(payment.amount_vnd), strong: true },
      ...(BigInt(payment.advance_amount_vnd) > 0n ? [{ label: "Trong đó ứng trước", value: money(payment.advance_amount_vnd) }] : []),
      ...(receipt && input.outstandingVnd !== null ? [{ label: "Công nợ hiện tại", value: money(input.outstandingVnd) }] : []),
    ],
    signatures: receipt ? ["Người nộp tiền", "Người thu tiền", "Kế toán"] : ["Người nhận tiền", "Người chi tiền", "Kế toán"],
    thanks: receipt && input.paper === "K80" ? "Cảm ơn quý khách!" : undefined, footnote: footnote(input.printedAt),
  };
}

// ---------------------------------------------------------------------------------------------------------- debt statement
export type StatementRow = { label: string; site_name: string | null; recorded_at: string | null; due_date: string; outstanding_amount_vnd: string; overdue: boolean };

export function debtStatementPrint(input: Common & { customer: { code: string; display_name: string; phone: string | null; address_text: string | null };
  asOf: string; rows: StatementRow[]; bank: PrintBank | null }): PrintDocumentInput {
  const total = sum(input.rows.map((row) => row.outstanding_amount_vnd));
  const overdue = sum(input.rows.filter((row) => row.overdue).map((row) => row.outstanding_amount_vnd));
  const asOfDate = formatBusinessDate(`${input.asOf}T12:00:00+07:00`);
  return {
    paper: input.paper, title: "BẢNG ĐỐI CHIẾU CÔNG NỢ", reference: `${input.customer.code}-${input.asOf.replaceAll("-", "")}`, company: input.company,
    issuedAt: `Số dư đến hết ngày ${asOfDate}`,
    info: [
      { label: "Khách hàng", value: input.customer.display_name }, { label: "Mã KH", value: input.customer.code },
      { label: "Địa chỉ", value: input.customer.address_text ?? "—" }, { label: "Điện thoại", value: input.customer.phone ?? "—" },
    ],
    columns: [{ label: "STT", key: "n", width: 28, align: "center" }, { label: "Chứng từ", key: "label", width: 170 }, { label: "Công trình", key: "site", width: 110 },
      { label: "Ngày", key: "date", width: 64, align: "center" }, { label: "Hạn trả", key: "due", width: 64, align: "center" }, { label: "Còn nợ", key: "amount", width: 84, align: "right" }],
    rows: input.rows.map((row, index) => ({ n: String(index + 1), label: `${row.label}${row.overdue ? " (quá hạn)" : ""}`, site: row.site_name ?? "—",
      date: row.recorded_at ? formatBusinessDate(row.recorded_at) : "—", due: formatBusinessDate(row.due_date), amount: plain(row.outstanding_amount_vnd) })),
    emptyText: "Không còn khoản công nợ nào.",
    totals: [{ label: "Tổng công nợ", value: money(total), strong: true }, ...(overdue > 0n ? [{ label: "Trong đó quá hạn", value: money(overdue) }] : [])],
    qr: qrBlock(input.bank, input.qrImage, total, bankTransferNote(input.bank?.prefix, null, input.customer.code)),
    notes: [{ title: "Đề nghị", text: `Quý khách vui lòng đối chiếu số liệu công nợ đến ngày ${asOfDate}, ký xác nhận và gửi lại cửa hàng. Nếu có chênh lệch, xin báo lại để cửa hàng kiểm tra.` }],
    signatures: ["Đại diện khách hàng", "Kế toán", "Đại diện bên bán"], footnote: footnote(input.printedAt),
  };
}
