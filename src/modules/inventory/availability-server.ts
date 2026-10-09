import "server-only";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import type { WarehouseAvailability } from "./availability";
export async function loadWarehouseAvailability(branchId: string, materialIds: string[]): Promise<WarehouseAvailability> {
  const access = await requireInternalPermission("inventory.read");
  if (access.branchId !== branchId) throw new Error("STOCK_BRANCH_SCOPE_MISMATCH");
  if (!materialIds.length) return { warehouses: [], positions: [], incomplete: false };
  const supabase = await createServerSupabase();
  const [warehouses, positions, units] = await Promise.all([
    supabase.from("warehouses").select("id, name").eq("branch_id", branchId).eq("active", true).order("name").limit(500),
    supabase.from("warehouse_inventory_read").select("warehouse_id, material_id, base_uom_id, on_hand_base_quantity::text, reserved_base_quantity::text, available_base_quantity::text").eq("branch_id", branchId).in("material_id", materialIds).order("warehouse_id").order("material_id").limit(1000),
    supabase.from("units_of_measure").select("id, symbol").limit(500),
  ]);
  const symbols = new Map((units.data ?? []).map(row => [row.id, row.symbol]));
  return { warehouses: warehouses.data ?? [], positions: (positions.data ?? []).map(row => ({ ...row, baseSymbol: symbols.get(row.base_uom_id) ?? row.base_uom_id })), incomplete: Boolean(warehouses.error || positions.error || units.error || warehouses.data?.length === 500 || positions.data?.length === 1000 || units.data?.length === 500) };
}
