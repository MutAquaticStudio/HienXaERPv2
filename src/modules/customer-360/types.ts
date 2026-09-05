import type { SnapshotPage } from "@/modules/platform/snapshot-view";
export const CUSTOMER_TIERS = [
  "STANDARD",
  "SILVER",
  "GOLD",
  "STRATEGIC",
] as const;

export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export const PRICE_RULE_SCOPES = [
  "CUSTOMER_MATERIAL",
  "CUSTOMER_MATERIAL_GROUP",
  "CUSTOMER_TIER",
  "DEFAULT",
] as const;

export type PriceRuleScope = (typeof PRICE_RULE_SCOPES)[number];

export interface Customer {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  taxCode?: string | null;
  phone?: string | null;
  email?: string | null;
  tier: CustomerTier;
  isActive: boolean;
}

export interface CustomerContact {
  id: string;
  customerId: string;
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

export interface CustomerSite {
  id: string;
  customerId: string;
  code: string;
  name: string;
  address: string;
  deliveryNotes?: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface PricingMaterial {
  id: string;
  code: string;
  name: string;
  groupId: string;
  groupName: string;
  salesUomId: string;
  salesUomSymbol: string;
  isActive: boolean;
}

export interface PricingMaterialGroup {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface PricingUom {
  id: string;
  symbol: string;
  name: string;
  isActive: boolean;
}

export interface CustomerPriceRule {
  id: string;
  scope: PriceRuleScope;
  customerId?: string | null;
  customerName?: string | null;
  customerTier?: CustomerTier | null;
  materialId?: string | null;
  materialName?: string | null;
  materialGroupId?: string | null;
  materialGroupName?: string | null;
  unitPrice: string;
  currency: string;
  uomId: string;
  uomSymbol: string;
  validFrom: string;
  validTo?: string | null;
  version: number;
  changeReason: string;
}

export interface ResolvedPrice {
  ruleId: string;
  scope: PriceRuleScope;
  unitPrice: string;
  currency: string;
  uomId: string;
  uomSymbol: string;
  version: number;
  validFrom: string;
  validTo?: string | null;
}

export interface SellingPriceSnapshot extends ResolvedPrice {
  transactionRef: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  capturedAt: string;
}

export interface CreditPolicy {
  id: string;
  customerId: string;
  creditLimit: string;
  allowedOverdueDays: number;
  validFrom: string;
  validTo?: string | null;
  version: number;
  changeReason: string;
}

export interface CreditExposure {
  customerId: string;
  receivableAmount: string;
  uninvoicedOrderAmount: string;
  overdueAmount: string;
  oldestOverdueDays: number;
  customerAdvanceAmount: string;
  calculatedAt: string;
}

export interface CreditDecision {
  status: "CLEAR" | "BLOCKED";
  projectedExposure: string;
  availableCredit: string;
  reasons: string[];
  policyId?: string;
}

export interface CustomerFinanceSummary {
  customerId: string;
  lifetimeRevenue: string;
  receivableAmount: string;
  overdueAmount: string;
  customerAdvanceAmount: string;
  lastSaleAt?: string | null;
  refreshedAt: string;
}

export interface CustomerTimelineEvent {
  id: string;
  customerId: string;
  eventType: string;
  title: string;
  detail?: string | null;
  occurredAt: string;
}

export interface Customer360Snapshot {
  page?: SnapshotPage;
  customers: Customer[];
  contacts: CustomerContact[];
  sites: CustomerSite[];
  materials: PricingMaterial[];
  materialGroups: PricingMaterialGroup[];
  uoms: PricingUom[];
  priceRules: CustomerPriceRule[];
  creditPolicies: CreditPolicy[];
  creditExposures: CreditExposure[];
  financeSummaries: CustomerFinanceSummary[];
  timeline: CustomerTimelineEvent[];
}

export type Customer360EntityKind =
  | "customer"
  | "contact"
  | "site"
  | "price-rule"
  | "credit-policy"
  | "credit-override";
