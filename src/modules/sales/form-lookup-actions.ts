"use server";

import { requireInternalPermission } from "@/lib/access/context";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";

type Kind = "order" | "quote";

async function accessFor(kind: Kind) {
  return requireInternalPermission(kind === "order" ? "orders.create" : "quotation.create");
}

export async function searchSalesCustomersAction(kind: Kind, term: string) {
  const access = await accessFor(kind);
  const q = parseCoreListQuery({ q: term }).q;
  const supabase = await createServerSupabase();
  let request = supabase.from("customers").select("id, display_name").eq("branch_id", access.branchId).eq("active", true);
  if (q) request = request.or(`code.ilike.${ilikePattern(q)},display_name.ilike.${ilikePattern(q)}`);
  const { data, error } = await request.order("display_name").order("id").limit(25);
  if (error) throw new Error("Không thể tìm khách hàng.");
  return (data ?? []).map((row) => ({ id: row.id, name: row.display_name }));
}

export async function searchSalesSitesAction(kind: Kind, customerId: string, term: string) {
  const access = await accessFor(kind);
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return [];
  const q = parseCoreListQuery({ q: term }).q;
  const supabase = await createServerSupabase();
  let request = supabase.from("customer_sites").select("id, name, address_text, customers!inner(branch_id)")
    .eq("customer_id", customerId).eq("customers.branch_id", access.branchId).eq("active", true);
  if (q) request = request.or(`code.ilike.${ilikePattern(q)},name.ilike.${ilikePattern(q)},address_text.ilike.${ilikePattern(q)}`);
  const { data, error } = await request.order("name").order("id").limit(25);
  if (error) throw new Error("Không thể tìm công trình.");
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, address: row.address_text }));
}
