import type { SalesOrderLine } from "@/modules/commercial/types";
import { PlatformError } from "@/modules/platform/errors";
import type {
  PurchaseCostSnapshot,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  SourcingMode,
  Supplier,
  SupplierPrice,
  SupplyAllocation,
} from "@/modules/sourcing/types";

function conflict(message: string, code = "INVALID_SOURCING_STATE"): never {
  throw new PlatformError(message, code, 409);
}

function positive(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new PlatformError(
      `${label} phải lớn hơn 0.`,
      "INVALID_SOURCING_DATA",
      400,
    );
  }
  return parsed;
}

export function validateSourcingRoute(input: {
  mode: SourcingMode;
  supplierId?: string | null;
  warehouseId?: string | null;
  directCustomerId?: string | null;
  directCustomerSiteId?: string | null;
}) {
  if (input.mode === "WAREHOUSE") {
    if (
      !input.warehouseId ||
      input.supplierId ||
      input.directCustomerId ||
      input.directCustomerSiteId
    ) {
      conflict(
        "Nguồn từ kho chỉ được chọn một kho nội bộ.",
        "INVALID_SOURCING_ROUTE",
      );
    }
    return;
  }

  if (!input.supplierId) {
    conflict(
      "Nguồn từ nhà cung cấp phải chọn nhà cung cấp.",
      "INVALID_SOURCING_ROUTE",
    );
  }

  if (input.mode === "SUPPLIER_DIRECT") {
    if (
      input.warehouseId ||
      !input.directCustomerId ||
      !input.directCustomerSiteId
    ) {
      conflict(
        "Giao thẳng phải có khách hàng và công trình, không được gắn kho giả.",
        "DROPSHIP_ROUTE_REQUIRES_CUSTOMER_SITE",
      );
    }
    return;
  }

  if (
    !input.warehouseId ||
    input.directCustomerId ||
    input.directCustomerSiteId
  ) {
    conflict(
      "Nhà cung cấp giao về kho phải chọn kho và không gắn điểm giao khách.",
      "INVALID_SOURCING_ROUTE",
    );
  }
}

export function planSupplyAllocation(input: {
  id: string;
  salesOrderLine: SalesOrderLine;
  fulfillmentRequirementId: string;
  salesOrderNumber: string;
  mode: SourcingMode;
  quantity: string;
  alreadyAllocatedQuantity: string;
  supplierId?: string | null;
  supplierName?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  directCustomerId?: string | null;
  directCustomerName?: string | null;
  directCustomerSiteId?: string | null;
  directCustomerSiteName?: string | null;
  createdAt: string;
}): SupplyAllocation {
  validateSourcingRoute(input);
  const quantity = positive(input.quantity, "Số lượng phân nguồn");
  const alreadyAllocated = Number(input.alreadyAllocatedQuantity);
  const ordered = positive(
    input.salesOrderLine.orderedQuantity,
    "Số lượng đơn bán",
  );
  if (alreadyAllocated + quantity > ordered + Number.EPSILON) {
    conflict(
      "Tổng số lượng chia nguồn vượt quá số lượng của dòng đơn bán.",
      "SUPPLY_ALLOCATION_EXCEEDS_ORDERED_QUANTITY",
    );
  }

  return Object.freeze({
    id: input.id,
    fulfillmentRequirementId: input.fulfillmentRequirementId,
    salesOrderLineId: input.salesOrderLine.id,
    salesOrderNumber: input.salesOrderNumber,
    materialId: input.salesOrderLine.materialId,
    materialCode: input.salesOrderLine.materialCode,
    materialName: input.salesOrderLine.materialName,
    sourcingMode: input.mode,
    supplierId: input.supplierId ?? null,
    supplierName: input.supplierName ?? null,
    warehouseId: input.warehouseId ?? null,
    warehouseName: input.warehouseName ?? null,
    directCustomerId: input.directCustomerId ?? null,
    directCustomerName: input.directCustomerName ?? null,
    directCustomerSiteId: input.directCustomerSiteId ?? null,
    directCustomerSiteName: input.directCustomerSiteName ?? null,
    purchaseOrderLineId: null,
    allocatedQuantity: input.quantity,
    supplierDeliveredQuantity: "0",
    customerAcceptedQuantity: "0",
    customerBillableQuantity: "0",
    uomId: input.salesOrderLine.uomId,
    uomSymbol: input.salesOrderLine.uomSymbol,
    status: input.mode === "WAREHOUSE" ? "PLANNED" : "PLANNED",
    createdAt: input.createdAt,
  });
}

export function capturePurchaseCost(input: {
  id: string;
  supplier: Supplier;
  price: SupplierPrice;
  materialCode: string;
  materialName: string;
  capturedAt: string;
}): PurchaseCostSnapshot {
  if (input.price.supplierId !== input.supplier.id) {
    conflict(
      "Giá mua không thuộc nhà cung cấp đã chọn.",
      "SUPPLIER_PRICE_MISMATCH",
    );
  }
  return Object.freeze({
    id: input.id,
    sourceSupplierPriceId: input.price.id,
    supplierId: input.supplier.id,
    supplierCode: input.supplier.code,
    supplierName: input.supplier.name,
    materialId: input.price.materialId,
    materialCode: input.materialCode,
    materialName: input.materialName,
    uomId: input.price.uomId,
    uomSymbol: input.price.uomSymbol,
    unitCost: input.price.unitCost,
    currency: input.price.currency,
    supplierPriceVersion: input.price.version,
    capturedAt: input.capturedAt,
  });
}

export function createPurchaseOrder(input: {
  id: string;
  number: string;
  supplier: Supplier;
  allocation: SupplyAllocation;
  salesOrderLine: SalesOrderLine;
  costSnapshot: PurchaseCostSnapshot;
  createdAt: string;
}): { order: PurchaseOrder; line: PurchaseOrderLine } {
  if (input.allocation.sourcingMode === "WAREHOUSE") {
    conflict(
      "Nguồn kho nội bộ không tạo đơn mua.",
      "WAREHOUSE_SOURCE_HAS_NO_PURCHASE_ORDER",
    );
  }
  if (input.allocation.purchaseOrderLineId) {
    conflict(
      "Phần chia nguồn này đã có đơn mua.",
      "ALLOCATION_ALREADY_ORDERED",
    );
  }
  if (input.allocation.supplierId !== input.supplier.id) {
    conflict(
      "Nhà cung cấp của đơn mua không khớp phần chia nguồn.",
      "SUPPLIER_MISMATCH",
    );
  }
  if (input.costSnapshot.supplierId !== input.supplier.id) {
    conflict(
      "Ảnh chụp giá mua không thuộc nhà cung cấp đã chọn.",
      "SUPPLIER_PRICE_MISMATCH",
    );
  }
  const quantity = positive(
    input.allocation.allocatedQuantity,
    "Số lượng đặt mua",
  );
  const unitCost = positive(input.costSnapshot.unitCost, "Đơn giá mua");
  const lineAmount = (quantity * unitCost).toFixed(2).replace(/\.00$/, "");
  const order: PurchaseOrder = Object.freeze({
    id: input.id,
    purchaseOrderNumber: input.number,
    supplierId: input.supplier.id,
    supplierCode: input.supplier.code,
    supplierName: input.supplier.name,
    status: "DRAFT",
    currency: input.costSnapshot.currency,
    totalAmount: lineAmount,
    deliveryMode: input.allocation.sourcingMode,
    warehouseId: input.allocation.warehouseId ?? null,
    warehouseName: input.allocation.warehouseName ?? null,
    directCustomerId: input.allocation.directCustomerId ?? null,
    directCustomerName: input.allocation.directCustomerName ?? null,
    directCustomerSiteId: input.allocation.directCustomerSiteId ?? null,
    directCustomerSiteName: input.allocation.directCustomerSiteName ?? null,
    createdAt: input.createdAt,
  });
  const line: PurchaseOrderLine = Object.freeze({
    id: `po-line-${input.allocation.id}`,
    purchaseOrderId: input.id,
    salesOrderLineId: input.salesOrderLine.id,
    supplyAllocationId: input.allocation.id,
    lineNumber: 1,
    materialId: input.salesOrderLine.materialId,
    materialCode: input.salesOrderLine.materialCode,
    materialName: input.salesOrderLine.materialName,
    orderedQuantity: input.allocation.allocatedQuantity,
    uomId: input.salesOrderLine.uomId,
    uomSymbol: input.salesOrderLine.uomSymbol,
    uomSnapshot: structuredClone(input.salesOrderLine.uomSnapshot),
    purchaseCostSnapshotId: input.costSnapshot.id,
    unitCost: input.costSnapshot.unitCost,
    currency: input.costSnapshot.currency,
    lineAmount,
  });
  return { order, line };
}

export function transitionPurchaseOrder(
  order: PurchaseOrder,
  nextStatus: PurchaseOrderStatus,
  occurredAt: string,
): PurchaseOrder {
  const allowed: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
    DRAFT: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["SENT", "CANCELLED"],
    SENT: ["ACKNOWLEDGED", "CANCELLED"],
    ACKNOWLEDGED: ["PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED"],
    PARTIALLY_DELIVERED: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
  };
  if (!allowed[order.status].includes(nextStatus)) {
    conflict(
      `Không thể chuyển đơn mua từ ${order.status} sang ${nextStatus}.`,
      "INVALID_PURCHASE_ORDER_TRANSITION",
    );
  }
  return Object.freeze({
    ...order,
    status: nextStatus,
    confirmedAt: nextStatus === "CONFIRMED" ? occurredAt : order.confirmedAt,
    sentAt: nextStatus === "SENT" ? occurredAt : order.sentAt,
    acknowledgedAt:
      nextStatus === "ACKNOWLEDGED" ? occurredAt : order.acknowledgedAt,
  });
}

export function recordSupplyQuantities(input: {
  allocation: SupplyAllocation;
  supplierDeliveredQuantity: string;
  customerAcceptedQuantity: string;
  customerBillableQuantity: string;
}): SupplyAllocation {
  const delivered = Number(input.supplierDeliveredQuantity);
  const accepted = Number(input.customerAcceptedQuantity);
  const billable = Number(input.customerBillableQuantity);
  const allocated = Number(input.allocation.allocatedQuantity);
  if (
    [delivered, accepted, billable].some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  ) {
    throw new PlatformError(
      "Số lượng thực tế không được âm.",
      "INVALID_SOURCING_DATA",
      400,
    );
  }
  if (delivered > allocated || accepted > delivered || billable > accepted) {
    conflict(
      "Số giao, số khách nhận và số tính tiền phải được lưu riêng và không vượt bước trước.",
      "INVALID_SUPPLY_QUANTITY_CHAIN",
    );
  }
  return Object.freeze({
    ...input.allocation,
    supplierDeliveredQuantity: input.supplierDeliveredQuantity,
    customerAcceptedQuantity: input.customerAcceptedQuantity,
    customerBillableQuantity: input.customerBillableQuantity,
    status:
      billable === allocated
        ? "COMPLETED"
        : delivered > 0
          ? "IN_PROGRESS"
          : input.allocation.status,
  });
}
