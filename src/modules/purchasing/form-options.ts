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
  availableLines: SalesOrderPurchaseLine[];
};

export type SalesOrderPurchaseLine = { id: string; materialId: string; materialName: string;
  uomId: string; uomSymbol: string; remainingOrderedQuantity: string };

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

export async function loadSalesOrderPurchaseLines(salesOrderId: string, branchId: string): Promise<SalesOrderPurchaseLine[]> {
  const supabase = await createServerSupabase();
  const { data: order } = await supabase.from("sales_orders").select("id").eq("id", salesOrderId).eq("branch_id", branchId).maybeSingle();
  if (!order) return [];
  const [lineResult, supplyResult] = await Promise.all([
    supabase.from("sales_order_lines").select("id, material_id, material_name_snapshot, ordered_uom_id, conversion_numerator, conversion_denominator, units_of_measure:ordered_uom_id(symbol)")
      .eq("sales_order_id", salesOrderId).order("line_number"),
    supabase.from("sales_line_supply_read").select("sales_order_line_id, remaining_base_quantity")
      .eq("sales_order_id", salesOrderId).eq("branch_id", branchId),
  ]);
  if (lineResult.error || supplyResult.error) return [];
  const remaining = new Map((supplyResult.data ?? []).map((row) => [row.sales_order_line_id, row.remaining_base_quantity]));
  return (lineResult.data ?? []).map((line) => {
    const uomRelation = line.units_of_measure;
    const uom = (Array.isArray(uomRelation) ? uomRelation[0] : uomRelation) as { symbol: string } | null;
    const factor = new Decimal(line.conversion_numerator).div(line.conversion_denominator);
    return { id: line.id, materialId: line.material_id, materialName: line.material_name_snapshot,
      uomId: line.ordered_uom_id, uomSymbol: uom?.symbol ?? "đơn vị",
      remainingOrderedQuantity: new Decimal(remaining.get(line.id) ?? 0).div(factor).toDecimalPlaces(6).toString() };
  });
}

export async function loadSalesLineContext(salesLineId: string, branchId: string): Promise<SalesLineContext | null> {
  const supabase = await createServerSupabase();
  const lineResult = await supabase.from("sales_order_lines")
    .select("id, sales_order_id, material_name_snapshot, units_of_measure:ordered_uom_id(symbol), sales_orders!inner(order_number, branch_id, customer_name_snapshot, site_name_snapshot)")
    .eq("id", salesLineId).maybeSingle();
  if (!lineResult.data || lineResult.error) return null;
  const orderRelation = lineResult.data.sales_orders;
  const order = (Array.isArray(orderRelation) ? orderRelation[0] : orderRelation) as { order_number: string; branch_id: string; customer_name_snapshot: string; site_name_snapshot: string } | null;
  const uomRelation = lineResult.data.units_of_measure;
  const uom = (Array.isArray(uomRelation) ? uomRelation[0] : uomRelation) as { symbol: string } | null;
  if (!order || order.branch_id !== branchId) return null;
  const availableLines = await loadSalesOrderPurchaseLines(lineResult.data.sales_order_id, branchId);
  const selected = availableLines.find((line) => line.id === salesLineId);
  if (!selected) return null;
  return {
    id: lineResult.data.id,
    orderId: lineResult.data.sales_order_id,
    orderNumber: order.order_number,
    customerName: order.customer_name_snapshot,
    siteName: order.site_name_snapshot,
    materialName: lineResult.data.material_name_snapshot,
    orderedUomSymbol: uom?.symbol ?? "đơn vị",
    remainingOrderedQuantity: selected.remainingOrderedQuantity,
    availableLines,
  };
}
