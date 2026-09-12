import { AppError } from "@/lib/core/errors";

export type PriceScope = "CUSTOMER_MATERIAL" | "CUSTOMER_GROUP" | "CUSTOMER_TIER" | "DEFAULT";

export type PriceRule = Readonly<{
  id: string;
  branchId: string;
  scope: PriceScope;
  customerId?: string;
  materialId?: string;
  materialGroupId?: string;
  customerTierCode?: string;
  priceUomId: string;
  unitPriceVnd: string;
  version: number;
  sourceType: "LIST" | "CONTRACT" | "MANUAL_APPROVED";
  effectiveFrom: string;
  effectiveTo?: string;
  active: boolean;
}>;

export type PriceSnapshot = Readonly<{
  unitPriceVnd: string;
  orderedUomId: string;
  baseUomId: string;
  conversionNumerator: string;
  conversionDenominator: string;
  roundingMode: "HALF_UP" | "DOWN";
  ruleId: string | null;
  ruleVersion: number | null;
  sourceType: PriceRule["sourceType"];
  overriddenBy: string | null;
  overrideReason: string | null;
}>;

const precedence: Record<PriceScope, number> = {
  CUSTOMER_MATERIAL: 4,
  CUSTOMER_GROUP: 3,
  CUSTOMER_TIER: 2,
  DEFAULT: 1,
};

export function resolvePrice(input: {
  branchId: string;
  customerId: string;
  customerTierCode?: string;
  materialId: string;
  materialGroupId: string;
  priceUomId: string;
  at: Date;
  rules: readonly PriceRule[];
}): PriceRule {
  const at = input.at.getTime();
  const candidates = input.rules.filter((rule) => {
    if (!rule.active || rule.branchId !== input.branchId || rule.priceUomId !== input.priceUomId) return false;
    if (new Date(rule.effectiveFrom).getTime() > at || (rule.effectiveTo && new Date(rule.effectiveTo).getTime() <= at)) return false;
    if (rule.scope === "CUSTOMER_MATERIAL") return rule.customerId === input.customerId && rule.materialId === input.materialId;
    if (rule.scope === "CUSTOMER_GROUP") return rule.customerId === input.customerId && rule.materialGroupId === input.materialGroupId;
    if (rule.scope === "CUSTOMER_TIER") return rule.customerTierCode === input.customerTierCode && rule.materialId === input.materialId;
    return rule.scope === "DEFAULT" && rule.materialId === input.materialId;
  });
  const selected = candidates.sort((left, right) => precedence[right.scope] - precedence[left.scope] || right.version - left.version)[0];
  if (!selected) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Không có giá hợp lệ; cần giá thủ công được duyệt.", status: 422 });
  }
  return selected;
}

export function createPriceSnapshot(input: {
  rule?: PriceRule;
  manualPriceVnd?: string;
  orderedUomId: string;
  baseUomId: string;
  conversionNumerator: string;
  conversionDenominator: string;
  roundingMode: "HALF_UP" | "DOWN";
  overrideActorId?: string;
  overrideReason?: string;
}): PriceSnapshot {
  if (!input.rule && (!input.manualPriceVnd || !input.overrideActorId || !input.overrideReason?.trim())) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Giá thủ công cần người duyệt và lý do.", status: 422 });
  }
  return Object.freeze({
    unitPriceVnd: input.manualPriceVnd ?? input.rule!.unitPriceVnd,
    orderedUomId: input.orderedUomId,
    baseUomId: input.baseUomId,
    conversionNumerator: input.conversionNumerator,
    conversionDenominator: input.conversionDenominator,
    roundingMode: input.roundingMode,
    ruleId: input.rule?.id ?? null,
    ruleVersion: input.rule?.version ?? null,
    sourceType: input.rule?.sourceType ?? "MANUAL_APPROVED",
    overriddenBy: input.manualPriceVnd ? input.overrideActorId ?? null : null,
    overrideReason: input.manualPriceVnd ? input.overrideReason ?? null : null,
  });
}
