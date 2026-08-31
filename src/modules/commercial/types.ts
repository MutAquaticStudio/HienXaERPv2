import type {
  CreditExposure,
  CreditPolicy,
  Customer,
  CustomerPriceRule,
  CustomerSite,
  PricingMaterial,
  PricingUom,
} from "@/modules/customer-360/types";

export const QUOTATION_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;

export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_REVISION_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "SUPERSEDED",
] as const;

export type QuotationRevisionStatus =
  (typeof QUOTATION_REVISION_STATUSES)[number];

export const SALES_ORDER_STATUSES = [
  "DRAFT",
  "CREDIT_BLOCKED",
  "CONFIRMED",
  "FULFILLING",
  "COMPLETED",
  "CANCELLED",
] as const;

export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export type PriceSafetyStatus =
  "RULE_MATCH" | "ABOVE_RULE" | "APPROVED_OVERRIDE";

export interface Quotation {
  id: string;
  quotationNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerSiteId?: string | null;
  customerSiteName?: string | null;
  status: QuotationStatus;
  activeRevisionId: string;
  ownerUserId: string;
  createdAt: string;
}

export interface QuotationRevision {
  id: string;
  quotationId: string;
  revisionNumber: number;
  status: QuotationRevisionStatus;
  validUntil: string;
  currency: string;
  subtotalAmount: string;
  totalAmount: string;
  notes?: string | null;
  sentAt?: string | null;
  acceptedAt?: string | null;
  lockedAt?: string | null;
  createdAt: string;
}

export interface QuotationLine {
  id: string;
  revisionId: string;
  lineNumber: number;
  materialId: string;
  materialCode: string;
  materialName: string;
  quantity: string;
  uomId: string;
  uomSymbol: string;
  uomSnapshot: {
    code: string;
    name: string;
    symbol: string;
    decimalScale: number;
  };
  priceRuleId: string;
  priceSnapshotId: string;
  referenceUnitPrice: string;
  unitPrice: string;
  currency: string;
  lineAmount: string;
  priceSafetyStatus: PriceSafetyStatus;
  priceOverrideReason?: string | null;
  priceApprovedBy?: string | null;
  priceApprovedAt?: string | null;
  priceRefreshedAt: string;
}

export interface SalesOrder {
  id: string;
  salesOrderNumber: string;
  quotationId: string;
  quotationRevisionId: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerSiteId?: string | null;
  customerSiteName?: string | null;
  status: SalesOrderStatus;
  currency: string;
  totalAmount: string;
  creditStatus: "PENDING" | "CLEAR" | "OVERRIDDEN" | "BLOCKED";
  creditDecisionSnapshot?: Record<string, unknown> | null;
  confirmedAt?: string | null;
  createdAt: string;
}

export interface SalesOrderLine {
  id: string;
  salesOrderId: string;
  sourceQuotationLineId: string;
  lineNumber: number;
  materialId: string;
  materialCode: string;
  materialName: string;
  orderedQuantity: string;
  uomId: string;
  uomSymbol: string;
  uomSnapshot: QuotationLine["uomSnapshot"];
  priceSnapshotId: string;
  priceRuleId: string;
  referenceUnitPrice: string;
  unitPrice: string;
  currency: string;
  lineAmount: string;
  priceSafetyStatus: PriceSafetyStatus;
}

export interface FulfillmentRequirement {
  id: string;
  salesOrderId: string;
  salesOrderLineId: string;
  requirementType: "MATERIAL_DELIVERY";
  status: "PENDING_READINESS" | "READY" | "ALLOCATED" | "CANCELLED";
  requiredQuantity: string;
  uomId: string;
  uomSymbol: string;
  customerSiteId?: string | null;
  createdAt: string;
}

export interface CommercialSnapshot {
  customers: Customer[];
  sites: CustomerSite[];
  materials: PricingMaterial[];
  uoms: PricingUom[];
  priceRules: CustomerPriceRule[];
  creditPolicies: CreditPolicy[];
  creditExposures: CreditExposure[];
  quotations: Quotation[];
  revisions: QuotationRevision[];
  quotationLines: QuotationLine[];
  salesOrders: SalesOrder[];
  salesOrderLines: SalesOrderLine[];
  fulfillmentRequirements: FulfillmentRequirement[];
}

export type CommercialCommandKind =
  | "quotation.create"
  | "quotation.add-line"
  | "quotation.refresh-prices"
  | "quotation.send"
  | "quotation.accept"
  | "quotation.revise"
  | "sales-order.convert"
  | "sales-order.confirm";
