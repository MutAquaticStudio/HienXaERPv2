import rolePresets from "./default-role-presets.json";
import { AppError } from "@/lib/core/errors";
import { QUOTATIONS_ENABLED } from "@/lib/features";

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
  ["pricing.read", "/admin/products/pricing"],
  ["customers.manage", "/admin/customers/manage"],
  ["suppliers.manage", "/admin/suppliers/manage"],
  ["catalog.manage", "/admin/products/manage"],
  ["work.read", "/work"],
] as const;

export function internalLandingPath(permissions: ReadonlySet<string>, roleName?: string): string {
  const preset = rolePresets.find((role) => role.name === roleName);
  if (preset && permissions.has(preset.landingPermission)) return preset.landingPath;
  const destination = destinations.find(([permission, path]) => permissions.has(permission) && (QUOTATIONS_ENABLED || path !== "/admin/quotations"));
  if (destination) return destination[1];
  throw new AppError({ code: "FORBIDDEN", message: "Bạn chưa được cấp quyền vào khu vực làm việc. Vui lòng liên hệ quản trị viên.", status: 403 });
}
