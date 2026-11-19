// D64: helpers shared by the assistant's list cards (prices, materials, suppliers, orders, receipts).
import { derivedOperationId } from "@/modules/sales/auto-sourcing";
import { normalizeRef } from "@/modules/sales/order-import";
import { ResolveError } from "./resolve";

export { derivedOperationId, normalizeRef };

/** A VND amount as people write it ("85.000", "85,000 ₫", "85000"), as digits; null when it is not a positive whole amount. */
export function parseVnd(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[.,\s₫đ]/g, "").replace(/vnd$/i, "");
  return /^[1-9]\d{0,14}$/.test(digits) ? digits : null;
}

/** A positive quantity ("20", "1,5"), as a plain decimal string with at most 6 decimals; null when invalid. */
export function parseQuantity(value: unknown): string | null {
  const text = String(value ?? "").trim().replace(",", ".");
  return /^\d+(\.\d{1,6})?$/.test(text) && Number(text) > 0 ? text : null;
}

export const vnFormat = (digits: string) => new Intl.NumberFormat("vi-VN").format(BigInt(digits));
export const businessToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** A yyyy-mm-dd date, or today when blank; a past or malformed date is a ResolveError the assistant can act on. */
export function dateOrToday(value: string, what = "Ngày áp dụng"): string {
  const text = value.trim();
  if (!text) return businessToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00+07:00`))) throw new ResolveError(`${what} dạng yyyy-mm-dd.`);
  if (text < businessToday()) throw new ResolveError(`${what} không được trước hôm nay.`);
  return text;
}

/** The message of a row that could not be saved, short enough for a list of failures. */
export function rowFailureText(message: string): string {
  if (/23505|duplicate|unique|exists|exist/i.test(message)) return "đã tồn tại";
  if (/42501|forbidden|permission/i.test(message)) return "không có quyền";
  if (/stale|PT409|active_rule/i.test(message)) return "giá vừa được người khác đổi";
  if (/material_or_uom_invalid/i.test(message)) return "vật tư hoặc đơn vị không dùng được";
  return "chưa lưu được";
}

/** How the rows of a batch ended: all done, or the ones that failed, so the card stays and a second confirm finishes the rest. */
export function finishBatch(done: number, total: number, failed: string[], noun: string): string {
  if (failed.length) {
    throw new ResolveError(`Đã xong ${done}/${total} ${noun}. Chưa làm được: ${failed.slice(0, 10).join("; ")}${failed.length > 10 ? "…" : ""}. Bấm Xác nhận lại để làm tiếp phần còn lại; phần đã xong không bị làm lại.`);
  }
  return `Đã xong ${done} ${noun}.`;
}
