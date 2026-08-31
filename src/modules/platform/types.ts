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
  "work_item.read_assigned",
  "work_pool.read",
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
