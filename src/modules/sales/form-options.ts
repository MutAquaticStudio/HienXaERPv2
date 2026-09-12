import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";

type CustomerRecord = {
  id: string;
  display_name: string;
  customer_sites: { id: string; name: string; address_text: string }[] | { id: string; name: string; address_text: string } | null;
};
type MaterialRecord = { id: string; name: string; base_uom_id: string };
type ConversionRecord = { material_id: string; from_uom_id: string };

export type SalesFormOptions = {
  customers: { id: string; name: string; sites: { id: string; name: string; address: string }[] }[];
  materials: { id: string; name: string; uoms: { id: string; symbol: string }[] }[];
};

export async function loadSalesFormOptions(branchId: string): Promise<SalesFormOptions> {
  const supabase = await createServerSupabase();
  const [customerResult, materialResult, conversionResult, uomResult] = await Promise.all([
    supabase.from("customers").select("id, display_name, customer_sites(id, name, address_text)").eq("branch_id", branchId).eq("active", true).order("display_name"),
    supabase.from("materials").select("id, name, base_uom_id").eq("active", true).eq("sale_enabled", true).order("name"),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id").eq("active", true).eq("settlement_allowed", true),
    supabase.from("units_of_measure").select("id, symbol").eq("active", true),
  ]);
  if (customerResult.error || materialResult.error || conversionResult.error || uomResult.error) throw new Error("Không thể tải dữ liệu tạo chứng từ bán hàng.");
  const uomSymbols = new Map((uomResult.data ?? []).map((uom) => [uom.id, uom.symbol]));
  const conversions = conversionResult.data as ConversionRecord[];
  const customers = (customerResult.data as unknown as CustomerRecord[]).map((customer) => {
    const sites = Array.isArray(customer.customer_sites) ? customer.customer_sites : customer.customer_sites ? [customer.customer_sites] : [];
    return { id: customer.id, name: customer.display_name, sites: sites.map((site) => ({ id: site.id, name: site.name, address: site.address_text })) };
  });
  const materials = (materialResult.data as MaterialRecord[]).map((material) => {
    const uomIds = new Set([material.base_uom_id, ...conversions.filter((row) => row.material_id === material.id).map((row) => row.from_uom_id)]);
    return { id: material.id, name: material.name, uoms: [...uomIds].map((id) => ({ id, symbol: uomSymbols.get(id) ?? "Đơn vị" })) };
  });
  return { customers, materials };
}
