function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function roleLabel(value?: string | null) {
  return lookupLabel({ Owner: "Chủ doanh nghiệp", OWNER: "Chủ doanh nghiệp", Admin: "Quản trị viên", ADMIN: "Quản trị viên", Sales: "Nhân viên kinh doanh", SALES: "Nhân viên kinh doanh", Warehouse: "Nhân viên kho", WAREHOUSE: "Nhân viên kho", Accountant: "Kế toán", ACCOUNTANT: "Kế toán", Finance: "Kế toán", FINANCE: "Kế toán", Worker: "Thợ", WORKER: "Thợ", Customer: "Khách hàng", CUSTOMER: "Khách hàng", FINANCE_CONTACT: "Người phụ trách thanh toán", RECEIVER: "Người nhận hàng", "Finance Contact": "Người phụ trách thanh toán", Driver: "Tài xế", DRIVER: "Tài xế" }, value, (value && /[À-ỹ]/.test(value) ? value : "Vai trò được phân công"));
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
