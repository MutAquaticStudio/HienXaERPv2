// FB16 (D38): the seller of a sales order ("NV bán hàng"), whose commission the payroll counts. A salesperson's order is
// always theirs (the database records the person creating it); only the owner of the business (roles.manage) names
// another seller, when creating for someone or later. The database checks this again (set_sales_order_seller).
import { derivedOperationId } from "./auto-sourcing";
import type { createServerSupabase } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
export type SellerOption = { id: string; name: string; assignable: boolean };

export const SELLER_PERMISSION = "roles.manage";
export const canChooseSeller = (permissions: ReadonlySet<string>) => permissions.has(SELLER_PERMISSION);

export async function loadSellers(supabase: Supabase, branchId: string): Promise<SellerOption[]> {
  const { data, error } = await supabase.rpc("sales_seller_options", { target_branch_id: branchId });
  if (error) return [];
  return (data ?? []) as SellerOption[];
}

/** The seller when the owner names none: whoever looks after the site, else the customer, else the owner. */
export async function defaultSeller(supabase: Supabase, customerId: string, siteId: string): Promise<string | null> {
  const [site, customer] = await Promise.all([
    supabase.from("customer_sites").select("sales_owner_employee_id").eq("id", siteId).maybeSingle(),
    supabase.from("customers").select("sales_owner_employee_id").eq("id", customerId).maybeSingle(),
  ]);
  return (site.data?.sales_owner_employee_id as string | null) ?? (customer.data?.sales_owner_employee_id as string | null) ?? null;
}

/**
 * After the owner creates an order: give it to the chosen seller, or by default to the site's / customer's salesperson.
 * Returns a Vietnamese problem, or null. Nothing is done for anyone else: their order stays theirs.
 */
export async function assignSellerAfterCreate(supabase: Supabase, input: { permissions: ReadonlySet<string>; employeeId: string; orderId: string;
  customerId: string; siteId: string; chosen?: string | null; operationId: string }): Promise<string | null> {
  if (!canChooseSeller(input.permissions)) return null;
  const seller = input.chosen || await defaultSeller(supabase, input.customerId, input.siteId);
  if (!seller || seller === input.employeeId) return null;
  const { error } = await supabase.rpc("set_sales_order_seller", { target_order_id: input.orderId, target_employee_id: seller, operation_id: derivedOperationId(input.operationId, "seller") });
  return error ? sellerError(error.message) : null;
}

export function sellerError(message: string): string {
  if (message.includes("sales_seller_locked_by_payroll")) return "Doanh thu của đơn đã nằm trong bảng lương đã chốt; không đổi người bán được nữa.";
  if (message.includes("sales_seller_not_assignable")) return "Nhân viên này không bán hàng ở chi nhánh (hoặc đã ngừng). Chọn người khác.";
  if (message.includes("forbidden")) return "Chỉ chủ doanh nghiệp được chỉ định / đổi người bán.";
  return "Chưa đổi được người bán. Tải lại trang rồi thử lại.";
}
