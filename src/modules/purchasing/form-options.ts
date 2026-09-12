import "server-only";

import Decimal from "decimal.js";
import { createServerSupabase } from "@/lib/supabase/server";

type CustomerRow = { id: string; display_name: string; customer_sites: { id: string; name: string; address_text: string }[] | { id: string; name: string; address_text: string } | null };
type MaterialRow = { id: string; name: string; base_uom_id: string };

export type PurchaseFormOptions = {
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  customers: { id: string; name: string; sites: { id: string; name: string; address: string }[] }[];
  materials: { id: string; name: string; uoms: { id: string; symbol: string }[] }[];
};

export type SalesLineContext = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  siteName: string;
  materialName: string;
  orderedUomSymbol: string;
  remainingOrderedQuantity: string;
};

export async function loadPurchaseFormOptions(branchId: string): Promise<PurchaseFormOptions> {
  const supabase = await createServerSupabase();
  const [supplierResult, warehouseResult, customerResult, materialResult, conversionResult, uomResult] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("branch_id", branchId).eq("active", true).order("name"),
    supabase.from("warehouses").select("id, name").eq("branch_id", branchId).eq("active", true).order("name"),
    supabase.from("customers").select("id, display_name, customer_sites(id, name, address_text)").eq("branch_id", branchId).eq("active", true).order("display_name"),
    supabase.from("materials").select("id, name, base_uom_id").eq("active", true).eq("purchase_enabled", true).order("name"),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id").eq("active", true).eq("settlement_allowed", true),
    supabase.from("units_of_measure").select("id, symbol").eq("active", true),
  ]);
  if ([supplierResult, warehouseResult, customerResult, materialResult, conversionResult, uomResult].some((result) => result.error)) throw new Error("Không thể tải dữ liệu tạo đơn mua.");
  const symbols = new Map((uomResult.data ?? []).map((row) => [row.id, row.symbol]));
  const conversions = conversionResult.data ?? [];
  const customers = (customerResult.data as unknown as CustomerRow[]).map((customer) => {
    const sites = Array.isArray(customer.customer_sites) ? customer.customer_sites : customer.customer_sites ? [customer.customer_sites] : [];
    return { id: customer.id, name: customer.display_name, sites: sites.map((site) => ({ id: site.id, name: site.name, address: site.address_text })) };
  });
  const materials = (materialResult.data as MaterialRow[]).map((material) => {
    const ids = new Set([material.base_uom_id, ...conversions.filter((row) => row.material_id === material.id).map((row) => row.from_uom_id)]);
    return { id: material.id, name: material.name, uoms: [...ids].map((id) => ({ id, symbol: symbols.get(id) ?? "Đơn vị" })) };
  });
  return {
    suppliers: (supplierResult.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    warehouses: (warehouseResult.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    customers,
    materials,
  };
}

export async function loadSalesLineContext(salesLineId: string, branchId: string): Promise<SalesLineContext | null> {
  const supabase = await createServerSupabase();
  const [lineResult, supplyResult] = await Promise.all([
    supabase.from("sales_order_lines").select("id, sales_order_id, material_name_snapshot, quantity, conversion_numerator, conversion_denominator, units_of_measure:ordered_uom_id(symbol), sales_orders!inner(order_number, branch_id, customer_name_snapshot, site_name_snapshot)").eq("id", salesLineId).maybeSingle(),
    supabase.from("sales_line_supply_read").select("remaining_base_quantity").eq("sales_order_line_id", salesLineId).maybeSingle(),
  ]);
  if (!lineResult.data || lineResult.error || !supplyResult.data) return null;
  const orderRelation = lineResult.data.sales_orders;
  const order = (Array.isArray(orderRelation) ? orderRelation[0] : orderRelation) as { order_number: string; branch_id: string; customer_name_snapshot: string; site_name_snapshot: string } | null;
  const uomRelation = lineResult.data.units_of_measure;
  const uom = (Array.isArray(uomRelation) ? uomRelation[0] : uomRelation) as { symbol: string } | null;
  if (!order || order.branch_id !== branchId) return null;
  const factor = new Decimal(lineResult.data.conversion_numerator).div(lineResult.data.conversion_denominator);
  return {
    id: lineResult.data.id,
    orderId: lineResult.data.sales_order_id,
    orderNumber: order.order_number,
    customerName: order.customer_name_snapshot,
    siteName: order.site_name_snapshot,
    materialName: lineResult.data.material_name_snapshot,
    orderedUomSymbol: uom?.symbol ?? "đơn vị",
    remainingOrderedQuantity: new Decimal(supplyResult.data.remaining_base_quantity).div(factor).toDecimalPlaces(6).toString(),
  };
}
