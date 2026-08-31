import type {
  Customer,
  CustomerPriceRule,
  PricingMaterial,
  ResolvedPrice,
  SellingPriceSnapshot,
} from "@/modules/customer-360/types";

const SCOPE_PRIORITY = {
  CUSTOMER_MATERIAL: 1,
  CUSTOMER_MATERIAL_GROUP: 2,
  CUSTOMER_TIER: 3,
  DEFAULT: 4,
} as const;

function isEffective(
  rule: CustomerPriceRule,
  effectiveDate: string,
): boolean {
  return (
    rule.validFrom <= effectiveDate &&
    (rule.validTo === null ||
      rule.validTo === undefined ||
      rule.validTo >= effectiveDate)
  );
}

function matchesRule(
  rule: CustomerPriceRule,
  customer: Customer,
  material: PricingMaterial,
): boolean {
  switch (rule.scope) {
    case "CUSTOMER_MATERIAL":
      return (
        rule.customerId === customer.id && rule.materialId === material.id
      );
    case "CUSTOMER_MATERIAL_GROUP":
      return (
        rule.customerId === customer.id &&
        rule.materialGroupId === material.groupId
      );
    case "CUSTOMER_TIER":
      return (
        rule.customerTier === customer.tier && rule.materialId === material.id
      );
    case "DEFAULT":
      return rule.materialId === material.id;
  }
}

export function resolveCustomerPrice(
  rules: CustomerPriceRule[],
  customer: Customer,
  material: PricingMaterial,
  effectiveDate: string,
): ResolvedPrice | null {
  const rule = rules
    .filter(
      (candidate) =>
        isEffective(candidate, effectiveDate) &&
        matchesRule(candidate, customer, material),
    )
    .sort((left, right) => {
      const priority =
        SCOPE_PRIORITY[left.scope] - SCOPE_PRIORITY[right.scope];
      if (priority !== 0) return priority;
      return right.version - left.version;
    })[0];

  if (!rule) return null;
  return {
    ruleId: rule.id,
    scope: rule.scope,
    unitPrice: rule.unitPrice,
    currency: rule.currency,
    uomId: rule.uomId,
    uomSymbol: rule.uomSymbol,
    version: rule.version,
    validFrom: rule.validFrom,
    validTo: rule.validTo,
  };
}

export function captureSellingPrice(input: {
  resolved: ResolvedPrice;
  transactionRef: string;
  customer: Customer;
  material: PricingMaterial;
  capturedAt: string;
}): SellingPriceSnapshot {
  return Object.freeze({
    ...input.resolved,
    transactionRef: input.transactionRef,
    customerId: input.customer.id,
    customerCode: input.customer.code,
    customerName: input.customer.name,
    materialId: input.material.id,
    materialCode: input.material.code,
    materialName: input.material.name,
    capturedAt: input.capturedAt,
  });
}
