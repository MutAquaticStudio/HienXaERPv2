/**
 * D60 Nhật ký hoạt động: what happened, in the owner's words — "đã xác nhận đơn bán SO-2026-000079 · Khách A" — never an
 * internal id. An action named here reads as one phrase; any other is read from its last word and the kind of object.
 */
export const ENTITY_NOUNS: Record<string, string> = {
  sales_order: "đơn bán", delivery: "phiếu giao", purchase_order: "đơn mua", purchase_receipt: "phiếu nhập hàng",
  payment: "phiếu thu/chi", payment_request: "yêu cầu thanh toán", payment_notice: "báo chuyển khoản", payment_reconciliation_match: "đối soát ngân hàng",
  customers: "khách hàng", customer: "khách hàng", customer_sites: "công trình", customer_site: "công trình",
  materials: "vật tư", material_groups: "nhóm vật tư", units_of_measure: "đơn vị tính", material_uom_conversions: "quy đổi đơn vị",
  suppliers: "nhà cung cấp", warehouses: "kho", vehicles: "xe", machines: "máy móc", branches: "chi nhánh", branch: "chi nhánh",
  pricing_rules: "chính sách giá", pricing_rule: "chính sách giá", purchase_price_rules: "giá mua",
  employee: "nhân viên", employee_branch_access: "quyền chi nhánh", role: "vai trò",
  stock_count: "phiếu kiểm kho", stock_count_line: "dòng kiểm kho", inventory_count: "phiếu kiểm kho", warehouse_transfer: "phiếu chuyển kho",
  expense: "chi phí", earning_event: "khoản thu nhập", compensation_rule: "quy tắc thu nhập", work_item: "việc của thợ", service_job: "việc dịch vụ",
  quotation: "báo giá", quotation_revision: "phiên bản báo giá", invoice_intent: "hồ sơ hóa đơn", route_plan: "lộ trình",
  conversation: "cuộc trò chuyện", delivery_handoff: "bàn giao hàng lên xe", supplier_fulfillment: "phiếu NCC giao thẳng",
  supplier_document: "chứng từ nhà cung cấp", supplier_return_credit: "trả hàng nhà cung cấp", return_case: "hàng trả về",
  finance_account: "tài khoản tiền", company_profile: "thông tin doanh nghiệp", purchase_price_book: "bảng giá mua",
  operational_opening_import: "số dư đầu kỳ", operational_reconciliation: "đối chiếu số dư đầu kỳ",
};

/** Whole phrases for the actions the system writes (verb + object kind). */
const ACTIONS: Record<string, string> = {
  "command.create_sales_order_draft": "tạo đơn bán nháp", "sales_order.confirm": "xác nhận đơn bán",
  "sales_order.confirm_credit_override": "xác nhận đơn bán vượt hạn mức", "sales_order.cancel": "hủy đơn bán",
  "sales_order.auto_sourced": "tự phân nguồn đơn bán", "sales_order.portal_submitted": "gửi đơn tự đặt trên cổng khách",
  "command.create_delivery_from_allocations": "tạo phiếu giao", "delivery.assigned": "phân xe, tài xế cho phiếu giao",
  "delivery.auto_dispatched": "tự điều phối phiếu giao", "delivery.split": "tách phiếu giao", "delivery.created_from_split": "tạo phiếu giao tách ra từ",
  "delivery.loaded": "bàn giao hàng lên xe", "delivery.returned_to_supplier": "trả hàng nhà cung cấp từ phiếu giao",
  "command.create_purchase_order_draft": "tạo đơn mua nháp", "command.create_direct_purchase_from_sales_order": "tạo đơn mua giao thẳng",
  "purchase_order.confirm": "xác nhận đơn mua", "purchase_order.sent": "gửi đơn mua", "purchase_order.receive": "nhận hàng vào kho",
  "command.verify_supplier_fulfillment": "xác minh NCC giao thẳng",
  "catalog.save": "lưu", "catalog.save_units": "lưu đơn vị tính của", "catalog.delete": "xóa", "profile.save": "lưu hồ sơ —",
  "branch.save": "lưu chi nhánh", "purchase_pricing.save": "lưu giá mua", "purchase_pricing.deactivate": "ngừng giá mua",
  "purchase_pricing.save_book": "lưu bảng giá mua", "supplier_material.assigned": "gán nhà cung cấp cho", "supplier_material.unassigned": "bỏ gán nhà cung cấp của",
  "payment.posted": "ghi sổ phiếu thu/chi", "payment.reversed": "đảo phiếu thu/chi", "payment.bank_auto_posted": "tự ghi nhận chuyển khoản",
  "payment.bank_reconciled": "đối soát ngân hàng", "payment_request.created": "tạo yêu cầu thanh toán", "payment_request.cash_confirmed": "xác nhận đã nhận tiền mặt",
  "payment_notice.submitted": "gửi báo chuyển khoản", "payment_notice.match_reversed": "bỏ ghép báo chuyển khoản",
  "stock_count.opened": "mở phiếu kiểm kho", "stock_count.line.recorded": "ghi số kiểm", "stock_count.lines_batch_recorded": "ghi số kiểm hàng loạt",
  "stock_count.approved": "duyệt phiếu kiểm kho", "stock_count.cancelled": "hủy phiếu kiểm kho", "warehouse_transfer.created": "tạo phiếu chuyển kho",
  "employee.deactivated": "ngừng tài khoản nhân viên", "employee.deleted": "xóa nhân viên", "employee.restored": "khôi phục nhân viên",
  "employee.invite.register": "kích hoạt tài khoản nhân viên", "employee.access.revoke": "thu hồi quyền vào chi nhánh của nhân viên", "employee.role.assign": "gán vai trò cho",
  "customer_portal.access_granted": "cấp tài khoản cổng khách cho", "customer.self_registered": "tự đăng ký tài khoản khách hàng",
  "conversation.created": "tạo cuộc trò chuyện", "conversation.direct_opened": "mở tin nhắn riêng",
  "expense.recorded": "ghi chi phí", "earning.approved": "duyệt khoản thu nhập", "service_job.created": "tạo việc dịch vụ", "service_job.verified": "xác minh việc dịch vụ",
  "work_item.published": "đăng việc cho thợ", "work_item.declined": "từ chối việc",
  "finance.account.bank_details": "cập nhật thông tin ngân hàng của", "finance.account.bank_feed": "cập nhật nguồn sao kê của",
  "operations.recording_started": "bắt đầu ghi nhận vận hành ở", "branch_operation_settings.saved": "lưu cài đặt giao hàng của",
  "company.portal_branch_set": "chọn chi nhánh nhận khách tự đăng ký",
  "supplier_document.registered": "ghi nhận chứng từ nhà cung cấp", "supplier_return.credit_offset": "cấn trừ hàng trả nhà cung cấp",
  "supplier_return.refund_received": "nhận tiền hoàn của nhà cung cấp",
};

const VERBS: Record<string, string> = {
  created: "tạo", create: "tạo", saved: "lưu", save: "lưu", updated: "cập nhật", update: "cập nhật", changed: "thay đổi", deleted: "xóa", delete: "xóa",
  confirm: "xác nhận", confirmed: "xác nhận", cancel: "hủy", cancelled: "hủy", approved: "duyệt", approve: "duyệt", rejected: "từ chối", declined: "từ chối",
  submitted: "gửi duyệt", sent: "gửi", send: "gửi", accept: "chấp nhận", accepted: "chấp nhận", assigned: "gán", revoked: "thu hồi", revoke: "thu hồi",
  posted: "ghi sổ", reversed: "đảo", verified: "xác minh", recorded: "ghi nhận", reconciled: "đối soát", imported: "nhập", published: "đăng",
  activated: "kích hoạt", deactivated: "ngừng", reactivated: "kích hoạt lại", restored: "khôi phục", resolved: "xử lý xong", calculated: "tính", opened: "mở",
};

export function entityNoun(type: string) { return ENTITY_NOUNS[type] ?? "dữ liệu"; }

/** "xác nhận đơn bán" — the phrase of an action on an object of this kind. */
export function actionPhrase(action: string, entityType: string) {
  const exact = ACTIONS[action];
  if (exact) {
    // A phrase ending in "—", "của", "cho", "ở", "từ", "lưu", "xóa" is followed by the object's own noun.
    return /(—|của|cho|ở|từ|lưu|xóa)$/.test(exact) && !/nhân viên$/.test(exact) ? `${exact.replace(/\s*—$/, "")} ${entityNoun(entityType)}` : exact;
  }
  const verb = VERBS[action.split(".").at(-1) ?? ""];
  return `${verb ?? "thao tác trên"} ${entityNoun(entityType)}`;
}

export type AuditObject = { label: string; href?: string };

/** "Owner Hiền Xa đã xác nhận đơn bán" and, beside it, the object: "SO-2026-000079 · Công ty An Phát". */
export function auditSentence(actorName: string, action: string, entityType: string) {
  return `${actorName} đã ${actionPhrase(action, entityType)}`;
}

/** The actions a person can pick in the filter, labelled; the stored code goes in the query. */
export const ACTION_FILTERS: [string, string][] = Object.entries(ACTIONS)
  .map(([code, phrase]): [string, string] => [code, phrase.replace(/\s*—$/, "").replace(/\s+(của|cho|ở|từ)$/, "")])
  .sort((left, right) => left[1].localeCompare(right[1], "vi"));
/** One choice per kind of object ("khách hàng" covers both stored codes); the filter value is the noun itself. */
export const ENTITY_FILTERS: string[] = [...new Set(Object.values(ENTITY_NOUNS))].sort((left, right) => left.localeCompare(right, "vi"));
export function entityCodesFor(noun: string) { return Object.entries(ENTITY_NOUNS).filter(([, value]) => value === noun).map(([code]) => code); }
