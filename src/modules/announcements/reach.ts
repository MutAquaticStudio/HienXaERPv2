/** A client that can call a database function (the request's own Supabase client). */
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/** After a price save: how many customers the automatic announcement told (D83). Null when unknown; never fails the save. */
export async function priceAnnouncementReach(supabase: RpcClient, branchId: string, ruleId: string | null | undefined): Promise<number | null> {
  if (!ruleId) return null;
  try {
    const { data, error } = await supabase.rpc("price_announcement_reach", { target_branch_id: branchId, target_rule_id: ruleId });
    return error || typeof data !== "number" ? null : data;
  } catch {
    return null;
  }
}
