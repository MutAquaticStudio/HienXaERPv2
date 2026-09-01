export const PROFITABILITY_LIFECYCLES = [
  "ESTIMATED",
  "ACTUAL_OPEN",
  "FINALIZED",
] as const;
export const PROFITABILITY_BASES = ["QUOTED", "COMMITTED", "ACTUAL"] as const;
export const DIRECT_COST_CATEGORIES = [
  "MATERIAL",
  "TRANSPORT",
  "LOADING",
  "FUEL",
  "DIRECT_LABOR",
  "OTHER_DIRECT",
] as const;

export type ProfitabilityLifecycle = (typeof PROFITABILITY_LIFECYCLES)[number];
export type ProfitabilityBasis = (typeof PROFITABILITY_BASES)[number];
export type DirectCostCategory = (typeof DIRECT_COST_CATEGORIES)[number];

export interface ProfitabilityCommandCenter {
  asOfDate: string;
  revenue: string;
  contributionProfit: string;
  actualMarginPercent: string | null;
  receivables: string;
  payables: string;
  cashBalance: string;
  workingCapital: string;
  estimatedCount: number;
  actualOpenCount: number;
  finalizedCount: number;
}

export interface OrderProfitabilitySummary {
  id: string;
  salesOrderId: string;
  salesOrderNumber: string;
  customerId: string;
  customerName: string;
  currency: string;
  lifecycle: ProfitabilityLifecycle;
  quotedRevenue: string;
  committedRevenue: string;
  actualRevenue: string;
  quotedDirectCost: string;
  committedDirectCost: string;
  actualDirectCost: string;
  quotedContributionProfit: string;
  committedContributionProfit: string;
  actualContributionProfit: string;
  quotedMarginPercent: string | null;
  committedMarginPercent: string | null;
  actualMarginPercent: string | null;
  marginVariancePoints: string | null;
  primaryMaterial: string;
  primarySupplier: string;
  vehiclePlate: string;
}

export interface DirectCostWaterfallItem {
  category: DirectCostCategory;
  basis: ProfitabilityBasis;
  amount: string;
}

export interface ProfitabilityDimensionSummary {
  dimension:
    "ORDER" | "CUSTOMER" | "MATERIAL" | "SUPPLIER" | "VEHICLE" | "SERVICE";
  dimensionId: string;
  dimensionName: string;
  currency: string;
  revenue: string;
  directCost: string;
  contributionProfit: string;
}

export interface ProfitabilitySnapshot {
  commandCenter: ProfitabilityCommandCenter;
  orders: OrderProfitabilitySummary[];
  costWaterfall: DirectCostWaterfallItem[];
  dimensions: ProfitabilityDimensionSummary[];
}

export type ProfitabilityCommandKind =
  | "profitability.cost.record"
  | "profitability.finalize"
  | "profitability.reopen";
