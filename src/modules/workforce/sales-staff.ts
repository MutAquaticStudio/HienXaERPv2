import type { createServerSupabase } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * FB9: "Nhân viên kinh doanh phụ trách" choices — the branch's staff who may create sales orders (the database decides,
 * `customer_site_sales_owner_options`); workers are not listed. Only people who can still be assigned are returned.
 */
export async function loadSalesStaffOptions(supabase: Supabase, branchId: string, term = ""): Promise<{ id: string; label: string }[]> {
  const { data, error } = await supabase.rpc("customer_site_sales_owner_options", { target_branch_id: branchId });
  if (error) throw new Error("Không tải được nhân viên kinh doanh.");
  const search = term.trim().toLocaleLowerCase("vi");
  return ((data ?? []) as { id: string; name: string; assignable: boolean }[])
    .filter((row) => row.assignable && (!search || row.name.toLocaleLowerCase("vi").includes(search)))
    .slice(0, 25).map((row) => ({ id: row.id, label: row.name }));
}
