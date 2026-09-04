export const EMPLOYEE_STATUSES = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "DISABLED",
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const ROLE_TEMPLATES = [
  "OWNER_ADMIN",
  "SALES",
  "PURCHASING_SOURCING",
  "DISPATCHER",
  "WAREHOUSE",
  "FINANCE",
  "DRIVER",
  "OPERATOR_WORKER",
  "SUPERVISOR",
  "AUDITOR_VIEWER",
] as const;

export type RoleTemplate = (typeof ROLE_TEMPLATES)[number];

export const PERMISSIONS = [
  "platform.access_office",
  "platform.access_worker",
  "finance.read",
  "margin.read",
  "profitability.manage",
  "work_item.read_assigned",
  "work_pool.read",
  "work_item.claim",
  "work_item.update_self",
  "work_item.heartbeat",
  "work_item.verify",
  "work_item.supervise",
  "work_notification.read",
  "audit.view",
  "evidence.create",
  "evidence.read",
  "user.manage",
  "role.manage",
  "master_data.read",
  "master_data.manage",
  "customer.read",
  "customer.manage",
  "pricing.read",
  "pricing.manage",
  "customer_credit.read",
  "customer_credit.manage",
  "customer_credit.override",
  "quotation.read",
  "quotation.create",
  "quotation.send",
  "quotation.accept",
  "sales_order.read",
  "sales_order.create",
  "sales_order.confirm",
  "price.override",
  "supplier.read",
  "supplier.manage",
  "supplier_price.read",
  "supplier_price.manage",
  "sourcing.read",
  "sourcing.manage",
  "purchase_order.read",
  "purchase_order.create",
  "purchase_order.confirm",
  "purchase_order.send",
  "inventory.read",
  "inventory.reserve",
  "inventory.receive",
  "inventory.issue",
  "inventory.count",
  "inventory.adjust",
  "inventory.policy.manage",
  "delivery.read",
  "delivery.plan",
  "delivery.assign",
  "delivery.dispatch",
  "delivery.update_assigned",
  "delivery.proof.create",
  "delivery.confirm",
  "finance.manage",
  "receivable.read",
  "receivable.adjust",
  "payable.read",
  "payable.adjust",
  "payment.read",
  "payment.create",
  "payment.allocate",
  "payment.post",
  "payment.reverse",
  "reconciliation.manage",
  "expense.manage",
  "service_job.read",
  "service_job.manage",
  "service_job.assign",
  "service_job.update_assigned",
  "service_job.approve",
  "service_job.confirm",
  "service_job.cost.manage",
  "compensation.read",
  "compensation.manage",
  "earning.read_self",
  "earning.approve",
  "earning.adjust",
  "payroll.close",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DATA_SCOPE_KINDS = [
  "ALL",
  "BRANCH",
  "WAREHOUSE",
  "ASSIGNED_ONLY",
  "SELF",
] as const;

export type DataScopeKind = (typeof DATA_SCOPE_KINDS)[number];

export interface DataScope {
  kind: DataScopeKind;
  branchId?: string;
  warehouseId?: string;
}

export interface Principal {
  userId: string;
  displayName: string;
  status: EmployeeStatus;
  roles: RoleTemplate[];
  permissions: Permission[];
  scopes: DataScope[];
}

export interface ScopedResource {
  assignedUserId?: string | null;
  branchId?: string | null;
  warehouseId?: string | null;
  ownerUserId?: string | null;
}
