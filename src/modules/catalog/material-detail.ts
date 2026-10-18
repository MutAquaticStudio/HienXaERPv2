import "server-only";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type MaterialDetail = { id: string; code: string; name: string; specification: string | null; group_id: string; base_uom_id: string; active: boolean; sale_enabled: boolean; purchase_enabled: boolean; variant_group_id: string | null; variant_attributes: Record<string, string> | null };
/** The product this material is a variant of (D11), with its sibling variants. */
export type MaterialVariant = { groupId: string; name: string; attributeNames: string[]; siblings: { id: string; code: string; name: string; attributes: Record<string, string>; active: boolean }[] };
export type MaterialConversion = { id: string; material_id: string | null; from_uom_id: string; to_uom_id: string; numerator: string; denominator: string; conversion_type: string; settlement_allowed: boolean; rounding_scale: number; rounding_mode: string; active: boolean; source_note: string | null };
export type MaterialSalesPrice = { id: string; scope_type: string; customer_id: string | null; customer_tier_code: string | null; price_uom_id: string; unit_price_vnd: string; version: number; source_type: string; effective_from: string; effective_to: string | null; active: boolean };
export type MaterialPurchasePrice = { id: string; supplier_id: string; purchase_uom_id: string; unit_cost_vnd: string; version: number; source_type: string; effective_from: string; effective_to: string | null; active: boolean };
export type MaterialMovement = { id: string; warehouse_id: string | null; delivery_id: string | null; base_uom_id: string; movement_type: string; base_quantity_delta: string; occurred_at: string };
export type MaterialPosition = { warehouse_id: string; base_uom_id: string; on_hand_base_quantity: string; reserved_base_quantity: string; available_base_quantity: string };

export function materialReadCapabilities(permissions: ReadonlySet<string>) {
  return {
    salesPrice: permissions.has("pricing.read"),
    purchasePrice: permissions.has("purchasing.read") && permissions.has("purchasing.price.read"),
    inventory: permissions.has("inventory.read"),
    suppliers: permissions.has("suppliers.read"),
  };
}

export async function loadMaterialDetail(materialId: string) {
  const access = await requireInternalPermission("catalog.read");
  if (!z.guid().safeParse(materialId).success) return null;
  const supabase = await createServerSupabase();
  const materialResult = await supabase.from("materials").select("id,code,name,specification,group_id,base_uom_id,active,sale_enabled,purchase_enabled,variant_group_id,variant_attributes").eq("id", materialId).maybeSingle();
  if (materialResult.error) throw new Error("Không thể tải vật tư.");
  if (!materialResult.data) return null;
  const material = materialResult.data as MaterialDetail;
  const capabilities = materialReadCapabilities(access.permissions);
  const noRows = Promise.resolve({ data: [], error: null });
  const [variantGroupResult, siblingResult] = await Promise.all([
    material.variant_group_id ? supabase.from("material_variant_groups").select("id,name,attribute_names").eq("id", material.variant_group_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    material.variant_group_id ? supabase.from("materials").select("id,code,name,variant_attributes,active").eq("variant_group_id", material.variant_group_id).order("name").limit(100) : noRows,
  ]);
  if (variantGroupResult.error || siblingResult.error) throw new Error("Không thể tải hàng cùng loại của vật tư.");
  const variantGroup = variantGroupResult.data as { id: string; name: string; attribute_names: string[] } | null;
  const variant: MaterialVariant | null = variantGroup ? {
    groupId: variantGroup.id, name: variantGroup.name, attributeNames: variantGroup.attribute_names,
    siblings: ((siblingResult.data ?? []) as { id: string; code: string; name: string; variant_attributes: Record<string, string> | null; active: boolean }[])
      .map((row) => ({ id: row.id, code: row.code, name: row.name, attributes: row.variant_attributes ?? {}, active: row.active })),
  } : null;
  const [unitResult, groupResult, conversionResult, salesResult, purchaseResult, stockResult, warehouseResult, supplierResult, movementResult] = await Promise.all([
    supabase.from("units_of_measure").select("id,name,symbol,decimal_scale").order("name").limit(1000),
    supabase.from("material_groups").select("id,name").eq("id", material.group_id).maybeSingle(),
    supabase.from("material_uom_conversions").select("id,material_id,from_uom_id,to_uom_id,numerator::text,denominator::text,conversion_type,settlement_allowed,rounding_scale,rounding_mode,active,source_note").or(`material_id.eq.${materialId},material_id.is.null`).limit(200),
    capabilities.salesPrice ? supabase.from("pricing_rule_read").select("id,scope_type,customer_id,customer_tier_code,price_uom_id,unit_price_vnd::text,version,source_type,effective_from,effective_to,active").eq("branch_id", access.branchId).or(`material_id.eq.${materialId},material_group_id.eq.${material.group_id}`).order("effective_from", { ascending: false }).limit(50) : noRows,
    capabilities.purchasePrice ? supabase.from("purchase_price_rules").select("id,supplier_id,purchase_uom_id,unit_cost_vnd::text,version,source_type,effective_from,effective_to,active").eq("branch_id", access.branchId).eq("material_id", materialId).order("effective_from", { ascending: false }).limit(50) : noRows,
    capabilities.inventory ? supabase.from("warehouse_inventory_read").select("warehouse_id,base_uom_id,on_hand_base_quantity::text,reserved_base_quantity::text,available_base_quantity::text").eq("branch_id", access.branchId).eq("material_id", materialId).order("warehouse_id").limit(200) : noRows,
    capabilities.inventory ? supabase.from("warehouses").select("id,name,active").eq("branch_id", access.branchId).order("name").limit(200) : noRows,
    capabilities.purchasePrice && capabilities.suppliers ? supabase.from("suppliers").select("id,name").eq("branch_id", access.branchId).order("name").limit(200) : noRows,
    capabilities.inventory ? supabase.from("inventory_movement_read").select("id,warehouse_id,delivery_id,base_uom_id,movement_type,base_quantity_delta,occurred_at").eq("branch_id", access.branchId).eq("material_id", materialId).order("occurred_at", { ascending: false }).order("id").limit(20) : noRows,
  ]);
  if ([unitResult, groupResult, conversionResult, salesResult, purchaseResult, stockResult, warehouseResult, supplierResult, movementResult].some(result => result.error)) throw new Error("Không thể tải thông tin vật tư trong phạm vi được phép.");
  return {
    access, material, capabilities, variant, asOf: Date.now(),
    units: (unitResult.data ?? []) as { id: string; name: string; symbol: string; decimal_scale: number }[],
    groupName: groupResult.data?.name ?? "Chưa có nhóm",
    conversions: ((conversionResult.data ?? []) as unknown as MaterialConversion[]).filter(row => row.material_id === materialId || row.from_uom_id === material.base_uom_id || row.to_uom_id === material.base_uom_id),
    salesPrices: (salesResult.data ?? []) as unknown as MaterialSalesPrice[],
    purchasePrices: (purchaseResult.data ?? []) as unknown as MaterialPurchasePrice[],
    movements: (movementResult.data ?? []) as unknown as MaterialMovement[],
    positions: (stockResult.data ?? []) as unknown as MaterialPosition[],
    warehouses: (warehouseResult.data ?? []) as { id: string; name: string; active: boolean }[],
    suppliers: (supplierResult.data ?? []) as { id: string; name: string }[],
  };
}
