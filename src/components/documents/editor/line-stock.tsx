"use client";

import Decimal from "decimal.js";
import { formatQuantity } from "@/lib/core/quantity";
import { normalizeDecimalInput } from "@/lib/core/vn-number";
import type { WarehouseAvailability } from "@/modules/inventory/availability";
import type { EditorMaterial } from "./types";

type Stock = { available: string; inUnit: string | null; symbol: string; baseSymbol: string; warehouse: string; short: boolean };

/**
 * Available stock of a material in one warehouse, in the line's unit when its ratio is known (97 bao) and in the base
 * unit (4.850 kg). Shown down to 3 decimals, never rounded up. `short` when the typed quantity needs more than that.
 */
export function lineStock(availability: WarehouseAvailability | undefined, warehouseId: string, material: EditorMaterial | undefined, uomId: string, quantity: string): Stock | null | undefined {
  if (!availability || !warehouseId || !material) return undefined;
  const position = availability.positions.find((row) => row.warehouse_id === warehouseId && row.material_id === material.id);
  if (!position) return null;
  const warehouse = availability.warehouses.find((row) => row.id === warehouseId)?.name ?? "Kho";
  const uom = material.uoms.find((row) => row.id === uomId);
  const available = new Decimal(position.available_base_quantity);
  const ratio = uom?.ratio && new Decimal(uom.ratio.numerator).gt(0) ? new Decimal(uom.ratio.numerator).div(uom.ratio.denominator) : null;
  const typed = normalizeDecimalInput(quantity);
  const needed = ratio && typed ? new Decimal(typed).mul(ratio) : null;
  return {
    available: available.toFixed(), baseSymbol: position.baseSymbol, warehouse, symbol: uom?.symbol ?? position.baseSymbol,
    inUnit: ratio && uom?.id !== position.base_uom_id ? available.div(ratio).toDecimalPlaces(3, Decimal.ROUND_DOWN).toFixed() : null,
    short: !!needed && needed.gt(available),
  };
}

export function LineStock(props: { availability?: WarehouseAvailability; warehouseId: string; material?: EditorMaterial; uomId: string; quantity: string }) {
  const stock = lineStock(props.availability, props.warehouseId, props.material, props.uomId, props.quantity);
  if (stock === undefined) return null;
  if (stock === null) return <small className="line-stock">Chưa có tồn tại kho đang xem.</small>;
  const amount = stock.inUnit !== null ? `${formatQuantity(stock.inUnit)} ${stock.symbol} (${formatQuantity(stock.available)} ${stock.baseSymbol})` : `${formatQuantity(stock.available)} ${stock.baseSymbol}`;
  return <small className={`line-stock${stock.short ? " short" : ""}`}>Có thể bán: {amount} · {stock.warehouse}{stock.short ? " · Thiếu so với số lượng đặt" : ""}</small>;
}
