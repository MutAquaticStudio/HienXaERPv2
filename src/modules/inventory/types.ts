export type InventoryMovementType =
  "RECEIPT" | "ISSUE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";

export interface InventoryPosition {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  baseUomId: string;
  baseUomSymbol: string;
  onHandQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  inventoryValue: string;
  movingAverageCost: string;
  minimumQuantity: string | null;
  targetQuantity: string | null;
  isLowStock: boolean;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  movementNumber: string;
  warehouseName: string;
  materialName: string;
  baseUomSymbol: string;
  movementType: InventoryMovementType;
  quantityDelta: string;
  unitCost: string;
  inventoryValueDelta: string;
  onHandAfter: string;
  movingAverageCostAfter: string;
  reason: string;
  occurredAt: string;
}

export interface StockReservation {
  id: string;
  reservationNumber: string;
  supplyAllocationId: string;
  salesOrderNumber: string;
  warehouseName: string;
  materialName: string;
  documentQuantity: string;
  documentUomSymbol: string;
  reservedQuantity: string;
  baseUomSymbol: string;
  status: "ACTIVE" | "CONSUMED" | "RELEASED" | "CANCELLED";
  createdAt: string;
}

export interface WarehouseAllocationOption {
  id: string;
  salesOrderNumber: string;
  warehouseName: string;
  materialName: string;
  allocatedQuantity: string;
  uomSymbol: string;
}

export interface InventoryMaterialOption {
  id: string;
  code: string;
  name: string;
  baseUomId: string;
  baseUomSymbol: string;
}

export interface InventoryWarehouseOption {
  id: string;
  code: string;
  name: string;
}

export interface EvidenceOption {
  id: string;
  label: string;
  capturedAt: string;
}

export interface StockCountSummary {
  id: string;
  countNumber: string;
  warehouseName: string;
  materialName: string;
  baseUomSymbol: string;
  systemQuantity: string | null;
  countedQuantity: string;
  varianceQuantity: string | null;
  status: "DRAFT" | "COUNTED" | "ADJUSTED" | "CANCELLED";
  countedAt: string;
}

export interface InventorySnapshot {
  positions: InventoryPosition[];
  movements: InventoryMovement[];
  reservations: StockReservation[];
  warehouseAllocations: WarehouseAllocationOption[];
  stockCounts: StockCountSummary[];
  materials: InventoryMaterialOption[];
  warehouses: InventoryWarehouseOption[];
  evidence: EvidenceOption[];
}

export type InventoryCommandKind =
  | "inventory.reserve"
  | "reservation.release"
  | "receipt.confirm"
  | "issue.confirm"
  | "stock-count.record"
  | "stock-adjustment.approve"
  | "reorder-policy.set";
