import type { createServerSupabase } from "@/lib/supabase/server";

/**
 * D58: the shop takes self-registrations once Cài đặt has chosen the branch receiving them (anon may read only that
 * column). No answer (network) → let the customer try; register_portal_customer still decides.
 */
export async function portalRegistrationOpen(supabase: Awaited<ReturnType<typeof createServerSupabase>>): Promise<boolean> {
  const { data, error } = await supabase.from("company_profile").select("portal_branch_id").limit(1).maybeSingle();
  if (error) return true;
  return Boolean((data as { portal_branch_id?: string | null } | null)?.portal_branch_id);
}
