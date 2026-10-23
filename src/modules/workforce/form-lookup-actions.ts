"use server";

import { requireInternalPermission } from "@/lib/access/context";
import { ilikePattern } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadSalesStaffOptions } from "./sales-staff";

export type ServiceJobCustomerOption = { id: string; code: string; display_name: string };
export type ServiceJobSiteOption = { id: string; customer_id: string; name: string };
export type ServiceJobResourceKind = "employee" | "sales" | "vehicle" | "machine";
export type ServiceJobResourceOption = { id: string; label: string };

export async function searchServiceJobCustomersAction(term: string): Promise<ServiceJobCustomerOption[]> {
  const access = await requireInternalPermission("service.manage");
  const supabase = await createServerSupabase();
  let request = supabase.from("customers").select("id, code, display_name")
    .eq("branch_id", access.branchId).eq("active", true);
  const search = term.trim().slice(0, 80);
  if (search) request = request.or(`code.ilike.${ilikePattern(search)},display_name.ilike.${ilikePattern(search)}`);
  const { data, error } = await request.order("display_name").order("id").limit(25);
  if (error) throw new Error("Không thể tìm khách hàng.");
  return data ?? [];
}

export async function searchServiceJobSitesAction(customerId: string, term: string): Promise<ServiceJobSiteOption[]> {
  const access = await requireInternalPermission("service.manage");
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return [];
  const supabase = await createServerSupabase();
  let request = supabase.from("customer_sites").select("id, customer_id, name, customers!inner(branch_id)")
    .eq("customers.branch_id", access.branchId).eq("customers.active", true)
    .eq("customer_id", customerId).eq("active", true);
  const search = term.trim().slice(0, 80);
  if (search) request = request.ilike("name", ilikePattern(search));
  const { data, error } = await request.order("name").order("id").limit(25);
  if (error) throw new Error("Không thể tìm công trình.");
  return (data ?? []).map(({ id, customer_id, name }) => ({ id, customer_id, name }));
}

export async function searchServiceJobResourcesAction(kind: ServiceJobResourceKind, term: string): Promise<ServiceJobResourceOption[]> {
  const access = await requireInternalPermission("service.manage");
  const supabase = await createServerSupabase();
  const search = term.trim().slice(0, 80);
  const pattern = ilikePattern(search);
  if (kind === "sales") return loadSalesStaffOptions(supabase, access.branchId, search);
  if (kind === "employee") {
    let request = supabase.from("workforce_read").select("id, code, display_name")
      .eq("branch_id", access.branchId).eq("active", true);
    if (search) request = request.or(`code.ilike.${pattern},display_name.ilike.${pattern}`);
    const { data, error } = await request.order("display_name").order("id").limit(25);
    if (error) throw new Error("Không thể tìm nhân sự.");
    return (data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.display_name}` }));
  }
  if (kind === "vehicle") {
    let request = supabase.from("vehicles").select("id, code, plate_number")
      .eq("branch_id", access.branchId).eq("active", true);
    if (search) request = request.or(`code.ilike.${pattern},plate_number.ilike.${pattern}`);
    const { data, error } = await request.order("code").order("id").limit(25);
    if (error) throw new Error("Không thể tìm xe.");
    return (data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.plate_number}` }));
  }
  if (kind === "machine") {
    let request = supabase.from("machines").select("id, code, name")
      .eq("branch_id", access.branchId).eq("active", true);
    if (search) request = request.or(`code.ilike.${pattern},name.ilike.${pattern}`);
    const { data, error } = await request.order("code").order("id").limit(25);
    if (error) throw new Error("Không thể tìm máy.");
    return (data ?? []).map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` }));
  }
  throw new Error("Loại tài nguyên không hợp lệ.");
}
