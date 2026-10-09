import Decimal from "decimal.js";
export type WarehouseAvailability = {
  warehouses: { id: string; name: string }[];
  positions: { warehouse_id: string; material_id: string; base_uom_id: string; baseSymbol: string; on_hand_base_quantity: string; reserved_base_quantity: string; available_base_quantity: string }[];
  incomplete: boolean;
};
export function stockDemand(available: string | null, demand: string, sameBaseUom: boolean): "UNKNOWN" | "UOM_MISMATCH" | "INVALID" | "SUFFICIENT" | "SHORT" {
  if (!sameBaseUom) return "UOM_MISMATCH";
  if (available === null) return "UNKNOWN";
  try {
    const a = new Decimal(available), q = new Decimal(demand);
    if (!a.isFinite() || !q.isFinite() || q.lte(0)) return "INVALID";
    return a.gte(q) ? "SUFFICIENT" : "SHORT";
  } catch { return "INVALID"; }
}
