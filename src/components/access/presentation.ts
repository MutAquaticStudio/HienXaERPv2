function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function roleLabel(value?: string | null) {
  return lookupLabel({ Owner: "Chủ doanh nghiệp", OWNER: "Chủ doanh nghiệp", Admin: "Quản trị viên", ADMIN: "Quản trị viên", Sales: "Nhân viên kinh doanh", SALES: "Nhân viên kinh doanh", Warehouse: "Nhân viên kho", WAREHOUSE: "Nhân viên kho", Accountant: "Kế toán", ACCOUNTANT: "Kế toán", Finance: "Kế toán", FINANCE: "Kế toán", Worker: "Thợ & tài xế", WORKER: "Thợ & tài xế", Customer: "Khách hàng", CUSTOMER: "Khách hàng", FINANCE_CONTACT: "Người phụ trách thanh toán", RECEIVER: "Người nhận hàng", "Finance Contact": "Người phụ trách thanh toán", Driver: "Thợ & tài xế", DRIVER: "Thợ & tài xế" }, value, (value && /[À-ỹ]/.test(value) ? value : "Vai trò được phân công"));
}

/**
 * Custom roles (not preset, without roles.manage) are named by the owner and shown as written, with or without
 * diacritics; preset and administrator roles keep their Vietnamese labels.
 */
export function roleDisplayName(role: { name: string; system_role?: boolean | null; role_permissions?: { permission_code: string }[] }) {
  const custom = role.system_role === false && !!role.role_permissions && !role.role_permissions.some((item) => item.permission_code === "roles.manage");
  return custom ? role.name : roleLabel(role.name);
}

export function permissionLabel(value: string) {
  return value
    .replace("Owner Master Data Access", "Quản lý danh mục cơ bản")
    .replace("Data Import", "Nhập dữ liệu")
    .replace("actual và billing", "sản lượng thực tế và tính khách")
    .replace("bằng chứng private", "minh chứng riêng tư")
    .replace("Master Data", "Danh mục cơ bản")
    .replace("Opening Import", "Nhập số dư đầu kỳ")
    .replace("Opening Reconciliation", "Đối chiếu số dư đầu kỳ")
    .replace("Business Activation", "Kích hoạt vận hành");
}
