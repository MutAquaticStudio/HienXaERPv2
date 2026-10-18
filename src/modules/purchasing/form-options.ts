import "server-only";

import Decimal from "decimal.js";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { editorVariant, VARIANT_MATERIAL_COLUMNS, type EditorVariant } from "@/modules/catalog/variants";

type CustomerRow = { id: string; display_name: string; customer_sites: { id: string; name: string; address_text: string }[] | { id: string; name: string; address_text: string } | null };
type MaterialRow = { id: string; code: string; name: string; base_uom_id: string; material_groups?: { name: string } | null } & Parameters<typeof editorVariant>[0];

export type PurchaseFormOptions = {
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string; address: string | null }[];
  customers: { id: string; name: string; sites: { id: string; name: string; address: string }[] }[];
  materials: { id: string; code: string; name: string; uoms: { id: string; symbol: string }[]; variant?: EditorVariant; group?: string }[];
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

export async function loadPurchaseSuppliers(branchId: string, query = "", selectedSupplierId?: string): Promise<PurchaseFormOptions["suppliers"]> {
  const supabase = await createServerSupabase();
  let request = supabase.from("suppliers").select("id, name").eq("branch_id", branchId).eq("active", true)
    .order("name").order("id").limit(50);
  const search = query.trim().slice(0, 120);
  if (search) {
    const pattern = JSON.stringify(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
    request = request.or(`name.ilike.${pattern},code.ilike.${pattern}`);
  }
  const [matches, selected] = await Promise.all([
    request,
    selectedSupplierId && z.guid().safeParse(selectedSupplierId).success
      ? supabase.from("suppliers").select("id, name").eq("branch_id", branchId).eq("active", true).eq("id", selectedSupplierId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (matches.error || selected.error) throw new Error("Không thể tải nhà cung cấp.");
  const rows = matches.data ?? [];
  const selectedSupplier = selected.data;
  if (selectedSupplier && !rows.some((row) => row.id === selectedSupplier.id)) rows.unshift(selectedSupplier);
  return rows;
}

export async function loadPurchaseFormOptions(branchId: string, selectedSupplierId?: string): Promise<PurchaseFormOptions> {
  const supabase = await createServerSupabase();
  const [suppliers, warehouseResult, customerResult, materialResult, conversionResult, uomResult] = await Promise.all([
    loadPurchaseSuppliers(branchId, "", selectedSupplierId),
    supabase.from("warehouses").select("id, name, address_text").eq("branch_id", branchId).eq("active", true).order("name"),
    supabase.from("customers").select("id, display_name, customer_sites(id, name, address_text)").eq("branch_id", branchId).eq("active", true).order("display_name"),
    supabase.from("materials").select(`id, code, name, base_uom_id, material_groups(name), ${VARIANT_MATERIAL_COLUMNS}`).eq("active", true).eq("purchase_enabled", true).order("name"),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id").eq("active", true).eq("settlement_allowed", true),
    supabase.from("units_of_measure").select("id, symbol").eq("active", true),
  ]);
  if ([warehouseResult, customerResult, materialResult, conversionResult, uomResult].some((result) => result.error)) throw new Error("Không thể tải dữ liệu tạo đơn mua.");
  const symbols = new Map((uomResult.data ?? []).map((row) => [row.id, row.symbol]));
  const conversions = conversionResult.data ?? [];
  const customers = (customerResult.data as unknown as CustomerRow[]).map((customer) => {
    const sites = Array.isArray(customer.customer_sites) ? customer.customer_sites : customer.customer_sites ? [customer.customer_sites] : [];
    return { id: customer.id, name: customer.display_name, sites: sites.map((site) => ({ id: site.id, name: site.name, address: site.address_text })) };
  });
  const materials = (materialResult.data as unknown as MaterialRow[]).map((material) => {
    const ids = new Set([material.base_uom_id, ...conversions.filter((row) => row.material_id === material.id).map((row) => row.from_uom_id)]);
    return { id: material.id, code: material.code, name: material.name, uoms: [...ids].map((id) => ({ id, symbol: symbols.get(id) ?? "Đơn vị" })), variant: editorVariant(material), group: material.material_groups?.name };
  });
  return {
    suppliers,
    warehouses: (warehouseResult.data ?? []).map((row) => ({ id: row.id, name: row.name, address: row.address_text })),
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
