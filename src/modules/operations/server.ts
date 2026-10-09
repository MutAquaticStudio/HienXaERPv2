import "server-only";
import { cache } from "react";
import { createServerSupabase } from "@/lib/supabase/server";
export const readOperationalState = cache(async (branchId: string) => {
 const supabase = await createServerSupabase();
 const { data, error } = await supabase.rpc("operational_branch_state", { target_branch_id: branchId });
 if (error || !data || typeof data !== "object") return null;
 return data as { state: string | null; version: number | null; canActivate: boolean; reconciliationId: string | null };
});
