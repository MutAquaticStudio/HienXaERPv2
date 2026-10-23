import { z } from "zod";
import { operationalPostingError } from "@/lib/core/errors";

/** Types offered while typing "Loại chi" when the branch has not used them yet (FB7, like KiotViet). */
export const EXPENSE_TYPE_SUGGESTIONS = ["Lương thưởng", "Mua đồ dùng công ty", "Marketing", "Thuê mặt bằng", "Điện nước", "Sửa chữa", "Mua tài sản/xe", "Vận chuyển", "Khác"];

export type OperatingExpenseInput = {
  categoryName: string; amount: string; effectiveAt: string; payeeKind: "OTHER" | "SUPPLIER" | "EMPLOYEE";
  supplierId: string | null; employeeId: string | null; payeeName: string | null; settlement: "PAID_NOW" | "PAYABLE";
  accountId: string | null; countsInProfit: boolean; description: string | null; salesOrderId: string | null; operationId: string;
};
type Parsed = { ok: true; value: OperatingExpenseInput } | { ok: false; field: string; message: string };

const guid = z.guid();
const text = (value: FormDataEntryValue | null) => typeof value === "string" ? value.trim() : "";

/** Reads the "Ghi chi phí" form; a refusal names the field to fix. */
export function parseOperatingExpense(form: FormData): Parsed {
  const categoryName = text(form.get("categoryName"));
  if (categoryName.length < 2 || categoryName.length > 120) return { ok: false, field: "categoryName", message: "Chọn hoặc gõ loại chi (ít nhất 2 ký tự)." };
  const amount = text(form.get("amount"));
  if (!/^\d{1,15}$/.test(amount) || BigInt(amount) <= 0n) return { ok: false, field: "amount", message: "Nhập số tiền chi lớn hơn 0." };
  const effectiveAt = text(form.get("effectiveAt"));
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(effectiveAt)) return { ok: false, field: "effectiveAt", message: "Chọn ngày chi." };
  const payeeKind = text(form.get("payeeKind"));
  if (payeeKind !== "OTHER" && payeeKind !== "SUPPLIER" && payeeKind !== "EMPLOYEE") return { ok: false, field: "payeeKind", message: "Chọn người nhận." };
  const supplierId = text(form.get("supplierId")), employeeId = text(form.get("employeeId"));
  if (payeeKind === "SUPPLIER" && !guid.safeParse(supplierId).success) return { ok: false, field: "supplierId", message: "Chọn nhà cung cấp nhận tiền." };
  if (payeeKind === "EMPLOYEE" && !guid.safeParse(employeeId).success) return { ok: false, field: "employeeId", message: "Chọn nhân viên nhận tiền." };
  const payeeName = text(form.get("payeeName"));
  if (payeeName.length > 160) return { ok: false, field: "payeeName", message: "Tên người nhận tối đa 160 ký tự." };
  const settlement = text(form.get("settlement"));
  if (settlement !== "PAID_NOW" && settlement !== "PAYABLE") return { ok: false, field: "settlement", message: "Chọn cách thanh toán." };
  if (settlement === "PAYABLE" && payeeKind !== "SUPPLIER") return { ok: false, field: "settlement", message: "Chỉ ghi nợ được cho nhà cung cấp. Chọn Đã trả ngay." };
  const accountId = text(form.get("accountId"));
  if (settlement === "PAID_NOW" && !guid.safeParse(accountId).success) return { ok: false, field: "accountId", message: "Chọn quỹ chi tiền (tiền mặt hoặc ngân hàng)." };
  const description = text(form.get("description"));
  if (description.length > 500) return { ok: false, field: "description", message: "Ghi chú tối đa 500 ký tự." };
  const salesOrderId = text(form.get("salesOrderId"));
  if (salesOrderId && !guid.safeParse(salesOrderId).success) return { ok: false, field: "salesOrderId", message: "Chọn lại đơn bán liên quan." };
  const operationId = text(form.get("operationId"));
  if (!guid.safeParse(operationId).success) return { ok: false, field: "", message: "Biểu mẫu đã cũ. Tải lại trang rồi ghi lại." };
  return { ok: true, value: {
    categoryName, amount, effectiveAt, payeeKind,
    supplierId: payeeKind === "SUPPLIER" ? supplierId : null, employeeId: payeeKind === "EMPLOYEE" ? employeeId : null,
    payeeName: payeeKind === "OTHER" && payeeName ? payeeName : null, settlement, accountId: settlement === "PAID_NOW" ? accountId : null,
    countsInProfit: form.get("countsInProfit") === "on", description: description || null, salesOrderId: salesOrderId || null, operationId,
  } };
}

/** Vietnamese reason for a refused expense, with the field to fix when there is one; the technical code is never shown. */
export function operatingExpenseError(raw: string | undefined, code: string | undefined): { message: string; field?: string } {
  const value = raw ?? "";
  if (code === "42501" || value.includes("forbidden")) return { message: "Bạn không có quyền ghi chi phí hoặc chi tiền từ quỹ ở chi nhánh này." };
  if (value.includes("invalid_expense_category")) return { field: "categoryName", message: "Loại chi không còn dùng. Chọn hoặc gõ loại khác." };
  if (value.includes("invalid_expense_supplier")) return { field: "supplierId", message: "Nhà cung cấp không còn hoạt động. Chọn lại." };
  if (value.includes("invalid_expense_employee")) return { field: "employeeId", message: "Nhân viên không còn làm ở chi nhánh này. Chọn lại." };
  if (value.includes("invalid_expense_source")) return { field: "salesOrderId", message: "Đơn bán liên quan không thuộc chi nhánh này." };
  if (value.includes("invalid_finance_account")) return { field: "accountId", message: "Quỹ chi tiền không còn dùng. Chọn quỹ khác." };
  if (value.includes("operation_payload_conflict")) return { message: "Lần gửi trước có nội dung khác. Kiểm tra lại rồi bấm Ghi chi phí." };
  if (value.includes("invalid_expense")) return { message: "Thông tin chi phí chưa hợp lệ. Kiểm tra số tiền, người nhận và cách thanh toán." };
  return { message: operationalPostingError(value) ?? "Chưa ghi được chi phí. Kiểm tra thông tin rồi thử lại." };
}

/** "Đã trả ngay" / "Ghi nợ NCC" / "Không dùng tiền" for the expense list. */
export function expenseSettlementLabel(settlement: string | null | undefined) {
  return settlement === "PAID_NOW" ? "Đã trả ngay" : settlement === "NON_CASH" ? "Không dùng tiền" : "Ghi nợ NCC";
}
