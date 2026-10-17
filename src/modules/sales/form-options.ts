import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { editorVariant, VARIANT_MATERIAL_COLUMNS, type EditorVariant } from "@/modules/catalog/variants";

import { loadWarehouseAvailability } from "@/modules/inventory/availability-server";
import type { WarehouseAvailability } from "@/modules/inventory/availability";

type CustomerRecord = {
  id: string;
  display_name: string;
};
type SiteRecord = { id: string; name: string; address_text: string };
type MaterialRecord = { id: string; code: string; name: string; base_uom_id: string } & Parameters<typeof editorVariant>[0];
type ConversionRecord = { material_id: string; from_uom_id: string; to_uom_id: string; numerator: string; denominator: string };

export type SalesFormOptions = {
  availability?: WarehouseAvailability;
  customers: { id: string; name: string; sites: { id: string; name: string; address: string }[] }[];
  materials: { id: string; code: string; name: string; uoms: { id: string; symbol: string; ratio?: { numerator: string; denominator: string } }[]; variant?: EditorVariant }[];
};

export async function loadSalesFormOptions(branchId: string, selectedCustomerId?: string, selectedSiteId?: string, canReadInventory = false): Promise<SalesFormOptions> {
  const supabase = await createServerSupabase();
  const validCustomerId = /^[0-9a-f-]{36}$/i.test(selectedCustomerId ?? "") ? selectedCustomerId : undefined;
  const validSiteId = /^[0-9a-f-]{36}$/i.test(selectedSiteId ?? "") ? selectedSiteId : undefined;
  const [customerResult, selectedCustomerResult, materialResult, conversionResult, uomResult] = await Promise.all([
    supabase.from("customers").select("id, display_name").eq("branch_id", branchId).eq("active", true).order("display_name").order("id").limit(25),
    validCustomerId ? supabase.from("customers").select("id, display_name").eq("branch_id", branchId).eq("id", validCustomerId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("materials").select(`id, code, name, base_uom_id, ${VARIANT_MATERIAL_COLUMNS}`).eq("active", true).eq("sale_enabled", true).order("name"),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id, to_uom_id, numerator::text, denominator::text").eq("active", true).eq("settlement_allowed", true),
    supabase.from("units_of_measure").select("id, symbol").eq("active", true),
  ]);
  if (customerResult.error || selectedCustomerResult.error || materialResult.error || conversionResult.error || uomResult.error) throw new Error("Không thể tải dữ liệu tạo chứng từ bán hàng.");
  const uomSymbols = new Map((uomResult.data ?? []).map((uom) => [uom.id, uom.symbol]));
  const conversions = conversionResult.data as unknown as ConversionRecord[];
  const customerRows = (customerResult.data ?? []) as CustomerRecord[];
  const selectedCustomer = selectedCustomerResult.data as CustomerRecord | null;
  const allCustomers = selectedCustomer && !customerRows.some((item) => item.id === selectedCustomer.id) ? [selectedCustomer, ...customerRows] : customerRows;
  const siteCustomerId = selectedCustomer?.id ?? allCustomers[0]?.id;
  const [siteResult, selectedSiteResult] = await Promise.all([
    siteCustomerId ? supabase.from("customer_sites").select("id, name, address_text").eq("customer_id", siteCustomerId).eq("active", true).order("name").order("id").limit(25) : Promise.resolve({ data: [], error: null }),
    siteCustomerId && validSiteId ? supabase.from("customer_sites").select("id, name, address_text").eq("customer_id", siteCustomerId).eq("id", validSiteId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (siteResult.error || selectedSiteResult.error) throw new Error("Không thể tải công trình của khách hàng.");
  const siteRows = (siteResult.data ?? []) as SiteRecord[];
  const selectedSite = selectedSiteResult.data as SiteRecord | null;
  if (selectedSite && !siteRows.some((item) => item.id === selectedSite.id)) siteRows.unshift(selectedSite);
  const sites = siteRows.map((site) => ({ id: site.id, name: site.name, address: site.address_text }));
  const customers = allCustomers.map((customer) => ({ id: customer.id, name: customer.display_name, sites: customer.id === siteCustomerId ? sites : [] }));
  const materials = (materialResult.data as unknown as MaterialRecord[]).map((material) => {
    const own = conversions.filter((row) => row.material_id === material.id);
    const uomIds = new Set([material.base_uom_id, ...own.map((row) => row.from_uom_id)]);
    // The ratio to the base unit lets the editor show stock in the line's unit (97 bao = 4.850 kg).
    const ratio = (id: string) => id === material.base_uom_id ? { numerator: "1", denominator: "1" }
      : own.filter((row) => row.from_uom_id === id && row.to_uom_id === material.base_uom_id).map((row) => ({ numerator: row.numerator, denominator: row.denominator }))[0];
    return { id: material.id, code: material.code, name: material.name, uoms: [...uomIds].map((id) => ({ id, symbol: uomSymbols.get(id) ?? "Đơn vị", ratio: ratio(id) })), variant: editorVariant(material) };
  });
  return { customers, materials, ...(canReadInventory ? { availability: await loadWarehouseAvailability(branchId, materials.map(row => row.id)) } : {}) };
}
