import type {
  FulfillmentRequirement,
  SalesOrderLine,
} from "@/modules/commercial/types";
import type {
  Customer,
  CustomerSite,
  PricingMaterial,
  PricingUom,
} from "@/modules/customer-360/types";

export const SOURCING_MODES = [
  "WAREHOUSE",
  "SUPPLIER_DIRECT",
  "SUPPLIER_TO_WAREHOUSE",
] as const;

export type SourcingMode = (typeof SOURCING_MODES)[number];

export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "SENT",
  "ACKNOWLEDGED",
  "PARTIALLY_DELIVERED",
  "DELIVERED",
  "CANCELLED",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export interface Supplier {
  id: string;
  code: string;
  name: string;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SupplierPrice {
  id: string;
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  uomId: string;
  uomSymbol: string;
  unitCost: string;
  currency: string;
  validFrom: string;
  validTo?: string | null;
  version: number;
  changeReason: string;
}

export interface PurchaseCostSnapshot {
  id: string;
  sourceSupplierPriceId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  uomId: string;
  uomSymbol: string;
  unitCost: string;
  currency: string;
  supplierPriceVersion: number;
  capturedAt: string;
}

export interface PurchaseOrder {
  id: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  currency: string;
  totalAmount: string;
  deliveryMode: Exclude<SourcingMode, "WAREHOUSE">;
  warehouseId?: string | null;
  warehouseName?: string | null;
  directCustomerId?: string | null;
  directCustomerName?: string | null;
  directCustomerSiteId?: string | null;
  directCustomerSiteName?: string | null;
  confirmedAt?: string | null;
  sentAt?: string | null;
  acknowledgedAt?: string | null;
  createdAt: string;
}

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  salesOrderLineId: string;
  supplyAllocationId: string;
  lineNumber: number;
  materialId: string;
  materialCode: string;
  materialName: string;
  orderedQuantity: string;
  uomId: string;
  uomSymbol: string;
  uomSnapshot: Record<string, unknown>;
  purchaseCostSnapshotId: string;
  unitCost: string;
  currency: string;
  lineAmount: string;
}

export interface SupplyAllocation {
  id: string;
  fulfillmentRequirementId: string;
  salesOrderLineId: string;
  salesOrderNumber: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  sourcingMode: SourcingMode;
  supplierId?: string | null;
  supplierName?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  directCustomerId?: string | null;
  directCustomerName?: string | null;
  directCustomerSiteId?: string | null;
  directCustomerSiteName?: string | null;
  purchaseOrderLineId?: string | null;
  allocatedQuantity: string;
  supplierDeliveredQuantity: string;
  customerAcceptedQuantity: string;
  customerBillableQuantity: string;
  uomId: string;
  uomSymbol: string;
  status: "PLANNED" | "ORDERED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt: string;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface PurchaseOrderEvidence {
  id: string;
  purchaseOrderId: string;
  evidenceId: string;
  label: string;
  createdAt: string;
}

export interface SourcingSnapshot {
  suppliers: Supplier[];
  supplierPrices: SupplierPrice[];
  purchaseCostSnapshots: PurchaseCostSnapshot[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderLines: PurchaseOrderLine[];
  allocations: SupplyAllocation[];
  evidence: PurchaseOrderEvidence[];
  salesOrderLines: SalesOrderLine[];
  fulfillmentRequirements: FulfillmentRequirement[];
  customers: Customer[];
  sites: CustomerSite[];
  materials: Array<
    PricingMaterial & { purchaseUomId: string; purchaseUomSymbol: string }
  >;
  uoms: PricingUom[];
  warehouses: WarehouseOption[];
}

export type SourcingCommandKind =
  | "supplier.create"
  | "supplier-price.record"
  | "supply.allocate"
  | "purchase-order.create"
  | "purchase-order.confirm"
  | "purchase-order.send"
  | "purchase-order.acknowledge"
  | "purchase-order.cancel";
