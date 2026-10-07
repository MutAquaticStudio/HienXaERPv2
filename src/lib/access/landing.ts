import { AppError } from "@/lib/core/errors";

const destinations = [
  ["dashboard.read", "/admin"],
  ["delivery.read", "/admin/dispatch"],
  ["purchasing.read", "/admin/purchase-orders"],
  ["finance.ar.read", "/admin/receivables"],
  ["finance.ap.read", "/admin/payables"],
  ["finance.expense.read", "/admin/expenses"],
  ["finance.payment_notice.review", "/admin/payment-notices"],
  ["orders.read", "/admin/orders"],
  ["quotation.read", "/admin/quotations"],
  ["inventory.read", "/admin/inventory"],
  ["customers.read", "/admin/customers"],
  ["suppliers.read", "/admin/suppliers"],
  ["catalog.read", "/admin/products"],
  ["workforce.read", "/admin/workforce"],
  ["compensation.read", "/admin/compensation"],
  ["service.read", "/admin/service-jobs"],
  ["roles.manage", "/admin/access"],
  ["pricing.read", "/admin/settings/pricing"],
  ["customers.manage", "/admin/settings"],
  ["suppliers.manage", "/admin/settings"],
  ["catalog.manage", "/admin/settings"],
  ["work.read", "/work"],
] as const;

export function internalLandingPath(permissions: ReadonlySet<string>): string {
  const destination = destinations.find(([permission]) => permissions.has(permission));
  if (destination) return destination[1];
  throw new AppError({ code: "FORBIDDEN", message: "No authorized workspace is available.", status: 403 });
}
