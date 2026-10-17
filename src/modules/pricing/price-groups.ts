import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";

export type PriceGroup = { code: string; name: string; active: boolean };
type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/** Customer price groups ("Lẻ / Sỉ / Đại lý…") of a branch; the code is what customers and group prices store. */
export async function loadPriceGroups(supabase: Supabase, branchId: string): Promise<PriceGroup[]> {
  const { data, error } = await supabase.from("customer_price_groups").select("code,name,active").eq("branch_id", branchId).order("name").limit(200);
  if (error) throw new Error("Không tải được nhóm giá khách.");
  return (data ?? []) as PriceGroup[];
}
