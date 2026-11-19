"use server";

import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { searchResult, type SearchResult } from "./results";

/** D56 ô tìm chung: the database decides what the user may see (global_search checks each group's permission). */
export async function globalSearchAction(term: string): Promise<SearchResult | { error: string }> {
  const text = String(term ?? "").trim().slice(0, 80);
  if (text.length < 2) return { groups: [], exact: null };
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("global_search", { target_branch_id: access.branchId, term: text });
  if (error) return { error: "Chưa tìm được. Kiểm tra kết nối rồi thử lại." };
  return searchResult((data ?? {}) as Parameters<typeof searchResult>[0], text);
}
