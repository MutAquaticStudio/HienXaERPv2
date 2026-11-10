// D71: which customers get a customer-portal login in "Tạo tài khoản hàng loạt". A login is the customer's phone number, so only a
// customer with a valid phone number of their own (no other customer uses it) and no active login yet is eligible.
import { normalizePhone, loginEmail } from "@/lib/auth/login-identifier";

export type BulkCustomer = { id: string; code: string; display_name: string; phone: string | null; active: boolean };
export type BulkEligible = { id: string; code: string; name: string; phone: string; login: string };
export type BulkSkipped = { id: string; code: string; name: string; reason: string };
export type BulkPlan = { eligible: BulkEligible[]; skipped: BulkSkipped[] };

/** Splits the branch's customers into those that get a login and those skipped (with the reason shown to the owner). */
export function planBulkPortalAccounts(customers: BulkCustomer[], withAccount: ReadonlySet<string>): BulkPlan {
  const byPhone = new Map<string, BulkCustomer[]>();
  for (const customer of customers) {
    const phone = normalizePhone(customer.phone ?? "");
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), customer]);
  }
  const plan: BulkPlan = { eligible: [], skipped: [] };
  for (const customer of customers) {
    const base = { id: customer.id, code: customer.code, name: customer.display_name };
    const raw = (customer.phone ?? "").trim();
    const phone = normalizePhone(raw);
    const sharing = phone ? (byPhone.get(phone) ?? []).filter((other) => other.id !== customer.id) : [];
    const reason = !customer.active ? "Khách đã ngừng hoạt động"
      : withAccount.has(customer.id) ? "Đã có tài khoản"
      : !raw ? "Chưa có số điện thoại"
      : !phone ? "Số điện thoại chưa đúng định dạng"
      : sharing.length ? `Số điện thoại dùng chung với ${sharing.map((other) => other.code).join(", ")}`
      : null;
    const login = phone ? loginEmail(phone) : null;
    if (reason || !phone || !login) plan.skipped.push({ ...base, reason: reason ?? "Số điện thoại chưa đúng định dạng" });
    else plan.eligible.push({ ...base, phone, login });
  }
  return plan;
}

type Reader = { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: unknown) => { limit: (count: number) => PromiseLike<{ data: unknown; error: unknown }> } } } };

const READ_LIMIT = 5000;

/** Reads the branch's customers and their active logins (RLS: the signed-in manager's branch only) and plans the batch. */
export async function loadBulkPortalPlan(supabase: unknown, branchId: string): Promise<BulkPlan> {
  const reader = supabase as Reader;
  const [customers, memberships] = await Promise.all([
    reader.from("customers").select("id, code, display_name, phone, active").eq("branch_id", branchId).limit(READ_LIMIT),
    reader.from("customer_portal_memberships").select("customer_id").eq("active", true).limit(READ_LIMIT),
  ]);
  if (customers.error || memberships.error) throw new Error("Không tải được danh sách khách hàng.");
  const withAccount = new Set(((memberships.data ?? []) as { customer_id: string }[]).map((row) => row.customer_id));
  return planBulkPortalAccounts(((customers.data ?? []) as BulkCustomer[]).slice().sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true })), withAccount);
}
