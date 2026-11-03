// D51 (Owner 03/11/2026): the customer is told about an order, a delivery, a payment or a debt by a Zalo message the staff
// send themselves ("Gửi qua Zalo"), free of charge — Zalo has no free way for an OA to message a phone number (only paid
// ZBS template messages). These are the texts the button prepares; the staff can read them before sending.
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";

const money = (value: string | bigint) => formatVnd(vnd(String(value)));
const sign = (company: string | null) => company ? `— ${company}` : "";
const lines = (items: readonly { name: string; quantity: string; unit: string }[]) => items.map((item) => `• ${item.name}: ${item.quantity} ${item.unit}`.trim());

/** zalo.me opens the chat with a Vietnamese mobile number (0912…; +84 / 84 numbers are written back to 0…). */
export function zaloChatLink(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (/^84[35789]\d{8}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^0[35789]\d{8}$/.test(digits) ? `https://zalo.me/${digits}` : null;
}

export type OrderMessage = { company: string | null; orderNumber: string; customerName: string; siteName: string; address: string;
  lines: { name: string; quantity: string; unit: string }[]; totalVnd: string; prepaidVnd?: string; deliveryAt: string | null };

export function orderConfirmedMessage(order: OrderMessage) {
  const prepaid = order.prepaidVnd && BigInt(order.prepaidVnd) > 0n ? BigInt(order.prepaidVnd) : 0n;
  return [
    `Xác nhận đơn hàng ${order.orderNumber} ${sign(order.company)}`.trim(),
    `Kính gửi ${order.customerName},`,
    "Cửa hàng đã xác nhận đơn của quý khách:",
    ...lines(order.lines),
    `Tổng tiền: ${money(order.totalVnd)}`,
    ...(prepaid > 0n ? [`Đã trả trước: ${money(prepaid)} · Còn lại: ${money(BigInt(order.totalVnd) - prepaid)}`] : []),
    `Giao tới: ${order.siteName} — ${order.address}`,
    order.deliveryAt ? `Dự kiến giao: ${formatBusinessDateTime(order.deliveryAt)}` : "Ngày giao: cửa hàng sẽ báo sau",
    "Cảm ơn quý khách!",
  ].join("\n");
}

export type DeliveryMessage = { company: string | null; deliveryNumber: string; customerName: string; siteName: string;
  deliveredAt: string | null; receiver: string | null; lines: { name: string; quantity: string; unit: string }[]; partial: boolean };

export function deliveryDoneMessage(delivery: DeliveryMessage) {
  return [
    `Đã giao hàng ${delivery.deliveryNumber} ${sign(delivery.company)}`.trim(),
    `Kính gửi ${delivery.customerName},`,
    `Cửa hàng đã giao tới ${delivery.siteName}${delivery.deliveredAt ? ` lúc ${formatBusinessDateTime(delivery.deliveredAt)}` : ""}${delivery.receiver ? `, người nhận: ${delivery.receiver}` : ""}.`,
    "Hàng đã nhận:",
    ...lines(delivery.lines),
    ...(delivery.partial ? ["Phần còn lại cửa hàng sẽ liên hệ giao sau."] : []),
    "Quý khách kiểm tra giúp, có sai sót xin báo lại cửa hàng. Cảm ơn quý khách!",
  ].join("\n");
}

export type PaymentMessage = { company: string | null; paymentNumber: string; customerName: string; amountVnd: string; paidAt: string;
  outstandingVnd: string | null };

export function paymentReceivedMessage(payment: PaymentMessage) {
  return [
    `Xác nhận đã nhận tiền ${sign(payment.company)}`.trim(),
    `Kính gửi ${payment.customerName},`,
    `Cửa hàng đã nhận ${money(payment.amountVnd)} ngày ${formatBusinessDate(payment.paidAt)} (phiếu thu ${payment.paymentNumber}).`,
    ...(payment.outstandingVnd !== null ? [BigInt(payment.outstandingVnd) > 0n ? `Công nợ hiện tại của quý khách: ${money(payment.outstandingVnd)}.` : "Hiện quý khách không còn công nợ."] : []),
    "Cảm ơn quý khách!",
  ].join("\n");
}

export type DebtMessage = { company: string | null; customerName: string; items: { label: string; dueDate: string; outstandingVnd: string; overdue: boolean }[];
  bank: { bankName: string; accountNumber: string; holder: string } | null; transferNote: string | null };

/** The reminder lists what is owed (oldest due first) and, when the shop shows one, the bank account to pay into. */
export function debtReminderMessage(debt: DebtMessage) {
  const owed = debt.items.filter((item) => BigInt(item.outstandingVnd) > 0n).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const total = owed.reduce((sum, item) => sum + BigInt(item.outstandingVnd), 0n);
  const overdue = owed.filter((item) => item.overdue).reduce((sum, item) => sum + BigInt(item.outstandingVnd), 0n);
  return [
    `Thông báo công nợ ${sign(debt.company)}`.trim(),
    `Kính gửi ${debt.customerName},`,
    `Công nợ hiện tại: ${money(total)}${overdue > 0n ? `, trong đó đã quá hạn: ${money(overdue)}` : ""}.`,
    ...owed.slice(0, 10).map((item) => `• ${item.label} — hạn ${formatBusinessDate(item.dueDate)}: ${money(item.outstandingVnd)}${item.overdue ? " (quá hạn)" : ""}`),
    ...(owed.length > 10 ? [`• … và ${owed.length - 10} khoản khác`] : []),
    ...(debt.bank ? [`Chuyển khoản: ${debt.bank.bankName} · ${debt.bank.accountNumber} · ${debt.bank.holder}${debt.transferNote ? ` · Nội dung: ${debt.transferNote}` : ""}`] : []),
    "Quý khách vui lòng thanh toán giúp. Nếu đã thanh toán, xin bỏ qua tin này. Cảm ơn quý khách!",
  ].join("\n");
}
