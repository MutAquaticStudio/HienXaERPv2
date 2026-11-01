/**
 * Bulk changes on a catalog list (select several rows, then one change for all of them). Each record still goes
 * through its own audited save command, so permissions, history and "changed by someone else" checks are unchanged.
 */
export const BULK_LIMIT = 200;
export const BULK_REASON = "Sửa hàng loạt";

export const bulkKinds = ["customers", "materials", "suppliers"] as const;
export type BulkKind = typeof bulkKinds[number];

type BulkFieldRule = { label: string; control: "option" | "days" | "boolean"; permission?: string; required?: boolean };

/** Fields that may be set to one value for many records. Names, phones and credit limits are deliberately absent. */
export const bulkFields: Record<BulkKind, Record<string, BulkFieldRule>> = {
  customers: {
    tier_code: { label: "Nhóm giá", control: "option", permission: "pricing.manage" },
    sales_owner_employee_id: { label: "NV kinh doanh phụ trách", control: "option" },
    payment_terms_days: { label: "Hạn thanh toán (ngày)", control: "days" },
  },
  materials: {
    group_id: { label: "Nhóm vật tư", control: "option", required: true },
    sale_enabled: { label: "Cho phép bán", control: "boolean" },
    purchase_enabled: { label: "Cho phép mua", control: "boolean" },
  },
  suppliers: {
    payment_terms_days: { label: "Hạn thanh toán (ngày)", control: "days" },
  },
};

export const bulkNouns: Record<BulkKind, string> = { customers: "khách hàng", materials: "vật tư", suppliers: "nhà cung cấp" };

export type BulkOperation =
  | { type: "set"; field: string; value: string | boolean | null }
  | { type: "active"; active: boolean }
  | { type: "delete" };

export type BulkFailure = { code: string; reason: string };
export type BulkOutcome = { status: "SUCCESS" | "PARTIAL" | "FAILED"; message: string; changed: number; unchanged: number; failed: BulkFailure[] };

/** Option value that clears a field (e.g. "Giá chung", "Chưa phân công"); sent to the server as an empty value. */
export const BULK_CLEAR = "__clear__";

/** Options the list page offers for one bulk field. */
export type BulkFieldChoice = { field: string; label: string; control: BulkFieldRule["control"]; options?: { value: string; label: string }[] };

const verbs: Record<BulkOperation["type"], string> = { set: "cập nhật", active: "cập nhật", delete: "xóa" };

export function bulkSummary(kind: BulkKind, operation: BulkOperation, changed: number, unchanged: number, failed: BulkFailure[]): BulkOutcome {
  const noun = bulkNouns[kind];
  const parts = [`Đã ${verbs[operation.type]} ${changed} ${noun}`];
  if (unchanged) parts.push(`${unchanged} ${noun} đã đúng sẵn, không cần đổi`);
  if (failed.length) parts.push(`${failed.length} ${noun} không thực hiện được`);
  const status = failed.length === 0 ? "SUCCESS" : changed + unchanged > 0 ? "PARTIAL" : "FAILED";
  return { status, message: `${parts.join("; ")}.`, changed, unchanged, failed };
}

/** The sentence asked before running, e.g. "Đổi Nhóm giá của 12 khách hàng thành “Sỉ”?" */
export function bulkConfirmText(kind: BulkKind, operation: BulkOperation, count: number, valueLabel?: string): string {
  const noun = `${count} ${bulkNouns[kind]}`;
  if (operation.type === "delete") return `Xóa hẳn ${noun}? Chỉ xóa được bản ghi chưa có chứng từ; bản ghi đã dùng sẽ được bỏ qua và báo lại.`;
  if (operation.type === "active") return operation.active ? `Dùng lại ${noun}?` : `Ngừng ${noun}? Bản ghi bị ẩn khỏi lựa chọn mới, lịch sử giữ nguyên.`;
  const rule = bulkFields[kind][operation.field];
  return `Đổi ${rule?.label ?? operation.field} của ${noun} thành “${valueLabel ?? String(operation.value ?? "")}”?`;
}
