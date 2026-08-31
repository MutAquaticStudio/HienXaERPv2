import type { InventorySnapshot } from "@/modules/inventory/types";

const WAREHOUSE_ID = "10000000-0000-4000-8000-000000000001";
const MATERIAL_ID = "20000000-0000-4000-8000-000000000001";
const UOM_ID = "30000000-0000-4000-8000-000000000001";

export const SYNTHETIC_INVENTORY: InventorySnapshot = {
  positions: [
    {
      warehouseId: WAREHOUSE_ID,
      warehouseCode: "KHO-HX",
      warehouseName: "Kho Hiền Xã",
      materialId: MATERIAL_ID,
      materialCode: "CAT-VANG",
      materialName: "Cát vàng",
      baseUomId: UOM_ID,
      baseUomSymbol: "kg",
      onHandQuantity: "125000",
      reservedQuantity: "25000",
      availableQuantity: "100000",
      inventoryValue: "137500000",
      movingAverageCost: "1100",
      minimumQuantity: "30000",
      targetQuantity: "120000",
      isLowStock: false,
      updatedAt: "2026-08-31T09:00:00.000Z",
    },
  ],
  movements: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      movementNumber: "IM-2026-000002",
      warehouseName: "Kho Hiền Xã",
      materialName: "Cát vàng",
      baseUomSymbol: "kg",
      movementType: "RECEIPT",
      quantityDelta: "25000",
      unitCost: "1500",
      inventoryValueDelta: "37500000",
      onHandAfter: "125000",
      movingAverageCostAfter: "1100",
      reason: "Nhập bổ sung theo kế hoạch",
      occurredAt: "2026-08-31T09:00:00.000Z",
    },
    {
      id: "40000000-0000-4000-8000-000000000002",
      movementNumber: "IM-2026-000001",
      warehouseName: "Kho Hiền Xã",
      materialName: "Cát vàng",
      baseUomSymbol: "kg",
      movementType: "RECEIPT",
      quantityDelta: "100000",
      unitCost: "1000",
      inventoryValueDelta: "100000000",
      onHandAfter: "100000",
      movingAverageCostAfter: "1000",
      reason: "Nhập tồn đầu kỳ đã xác minh",
      occurredAt: "2026-08-30T09:00:00.000Z",
    },
  ],
  reservations: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      reservationNumber: "RSV-2026-00001",
      supplyAllocationId: "60000000-0000-4000-8000-000000000001",
      salesOrderNumber: "SO-2026-00015",
      warehouseName: "Kho Hiền Xã",
      materialName: "Cát vàng",
      documentQuantity: "25",
      documentUomSymbol: "tấn",
      reservedQuantity: "25000",
      baseUomSymbol: "kg",
      status: "ACTIVE",
      createdAt: "2026-08-31T10:00:00.000Z",
    },
  ],
  warehouseAllocations: [
    {
      id: "60000000-0000-4000-8000-000000000002",
      salesOrderNumber: "SO-2026-00016",
      warehouseName: "Kho Hiền Xã",
      materialName: "Cát vàng",
      allocatedQuantity: "10",
      uomSymbol: "tấn",
    },
  ],
  stockCounts: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      countNumber: "CNT-2026-00001",
      warehouseName: "Kho Hiền Xã",
      materialName: "Cát vàng",
      baseUomSymbol: "kg",
      systemQuantity: "125000",
      countedQuantity: "124950",
      varianceQuantity: "-50",
      status: "COUNTED",
      countedAt: "2026-08-31T11:00:00.000Z",
    },
  ],
  materials: [
    {
      id: MATERIAL_ID,
      code: "CAT-VANG",
      name: "Cát vàng",
      baseUomId: UOM_ID,
      baseUomSymbol: "kg",
    },
  ],
  warehouses: [{ id: WAREHOUSE_ID, code: "KHO-HX", name: "Kho Hiền Xã" }],
  evidence: [
    {
      id: "80000000-0000-4000-8000-000000000001",
      label: "Ảnh biên bản kiểm kê ca sáng",
      capturedAt: "2026-08-31T11:05:00.000Z",
    },
  ],
};
