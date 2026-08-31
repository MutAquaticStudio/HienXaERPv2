import {
  assertCreditOverride,
  evaluateCustomerCredit,
} from "@/modules/customer-360/credit";
import type {
  CreditExposure,
  CreditPolicy,
} from "@/modules/customer-360/types";
import type {
  FulfillmentRequirement,
  Quotation,
  QuotationLine,
  QuotationRevision,
  SalesOrder,
  SalesOrderLine,
  SalesOrderStatus,
} from "@/modules/commercial/types";
import { PlatformError } from "@/modules/platform/errors";

function invalidState(
  message: string,
  code = "INVALID_COMMERCIAL_STATE",
): never {
  throw new PlatformError(message, code, 409);
}

export function refreshDraftPrices(input: {
  revision: QuotationRevision;
  lines: QuotationLine[];
  resolve: (line: QuotationLine) => {
    unitPrice: string;
    priceRuleId: string;
    priceSnapshotId?: string;
  } | null;
  refreshedAt: string;
}): QuotationLine[] {
  if (input.revision.status !== "DRAFT") {
    invalidState(
      "Báo giá đã gửi hoặc đã chấp nhận không thể làm mới giá.",
      "QUOTATION_REVISION_LOCKED",
    );
  }

  return input.lines.map((line) => {
    const resolved = input.resolve(line);
    if (!resolved) {
      throw new PlatformError(
        `Vật liệu ${line.materialName} chưa có giá hiệu lực.`,
        "NO_EFFECTIVE_SELLING_PRICE",
        422,
      );
    }
    const quantity = Number(line.quantity);
    const price = Number(resolved.unitPrice);
    return {
      ...line,
      priceRuleId: resolved.priceRuleId,
      priceSnapshotId: resolved.priceSnapshotId ?? line.priceSnapshotId,
      referenceUnitPrice: resolved.unitPrice,
      unitPrice: resolved.unitPrice,
      lineAmount: (quantity * price).toFixed(2).replace(/\.00$/, ""),
      priceSafetyStatus: "RULE_MATCH",
      priceOverrideReason: null,
      priceApprovedBy: null,
      priceApprovedAt: null,
      priceRefreshedAt: input.refreshedAt,
    };
  });
}

export function sendQuotationRevision(
  revision: QuotationRevision,
  sentAt: string,
): QuotationRevision {
  if (revision.status !== "DRAFT") {
    invalidState("Chỉ gửi được bản nháp báo giá.");
  }
  return Object.freeze({
    ...revision,
    status: "SENT" as const,
    sentAt,
    lockedAt: sentAt,
  });
}

export function acceptQuotationRevision(
  revision: QuotationRevision,
  acceptedAt: string,
): QuotationRevision {
  if (revision.status !== "SENT") {
    invalidState("Chỉ chấp nhận được phiên bản báo giá đã gửi.");
  }
  return Object.freeze({
    ...revision,
    status: "ACCEPTED" as const,
    acceptedAt,
    lockedAt: revision.lockedAt ?? acceptedAt,
  });
}

export function convertAcceptedQuotation(input: {
  quotation: Quotation;
  revision: QuotationRevision;
  lines: QuotationLine[];
  orderId: string;
  orderNumber: string;
  convertedAt: string;
}): { order: SalesOrder; lines: SalesOrderLine[] } {
  if (input.revision.status !== "ACCEPTED") {
    invalidState(
      "Chỉ báo giá đã được khách chấp nhận mới chuyển thành đơn bán.",
    );
  }
  if (input.lines.length === 0) {
    invalidState("Báo giá chưa có dòng vật liệu.");
  }

  const order: SalesOrder = Object.freeze({
    id: input.orderId,
    salesOrderNumber: input.orderNumber,
    quotationId: input.quotation.id,
    quotationRevisionId: input.revision.id,
    customerId: input.quotation.customerId,
    customerCode: input.quotation.customerCode,
    customerName: input.quotation.customerName,
    customerSiteId: input.quotation.customerSiteId,
    customerSiteName: input.quotation.customerSiteName,
    status: "DRAFT",
    currency: input.revision.currency,
    totalAmount: input.revision.totalAmount,
    creditStatus: "PENDING",
    creditDecisionSnapshot: null,
    createdAt: input.convertedAt,
  });
  const lines = input.lines.map<SalesOrderLine>((line) =>
    Object.freeze({
      id: `so-line-${line.id}`,
      salesOrderId: input.orderId,
      sourceQuotationLineId: line.id,
      lineNumber: line.lineNumber,
      materialId: line.materialId,
      materialCode: line.materialCode,
      materialName: line.materialName,
      orderedQuantity: line.quantity,
      uomId: line.uomId,
      uomSymbol: line.uomSymbol,
      uomSnapshot: structuredClone(line.uomSnapshot),
      priceSnapshotId: line.priceSnapshotId,
      priceRuleId: line.priceRuleId,
      referenceUnitPrice: line.referenceUnitPrice,
      unitPrice: line.unitPrice,
      currency: line.currency,
      lineAmount: line.lineAmount,
      priceSafetyStatus: line.priceSafetyStatus,
    }),
  );
  return { order, lines };
}

export function transitionSalesOrder(
  order: SalesOrder,
  nextStatus: SalesOrderStatus,
): SalesOrder {
  const allowed: Record<SalesOrderStatus, SalesOrderStatus[]> = {
    DRAFT: ["CREDIT_BLOCKED", "CONFIRMED", "CANCELLED"],
    CREDIT_BLOCKED: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["FULFILLING", "CANCELLED"],
    FULFILLING: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (!allowed[order.status].includes(nextStatus)) {
    invalidState(
      `Không thể chuyển đơn từ ${order.status} sang ${nextStatus}.`,
      "INVALID_SALES_ORDER_TRANSITION",
    );
  }
  return Object.freeze({ ...order, status: nextStatus });
}

export function confirmSalesOrder(input: {
  order: SalesOrder;
  lines: SalesOrderLine[];
  policy: CreditPolicy | null;
  exposure: CreditExposure;
  canOverrideCredit: boolean;
  overrideReason: string;
  confirmedAt: string;
}): {
  order: SalesOrder;
  requirements: FulfillmentRequirement[];
  projectedUninvoicedOrderAmount: string;
} {
  if (
    !(["DRAFT", "CREDIT_BLOCKED"] as SalesOrderStatus[]).includes(
      input.order.status,
    )
  ) {
    invalidState("Chỉ đơn nháp hoặc đơn đang chặn tín dụng mới được xác nhận.");
  }
  if (input.lines.length === 0) invalidState("Đơn bán chưa có dòng vật liệu.");

  const decision = evaluateCustomerCredit({
    policy: input.policy,
    exposure: input.exposure,
    orderAmount: input.order.totalAmount,
  });
  assertCreditOverride({
    decision,
    canOverride: input.canOverrideCredit,
    reason: input.overrideReason,
  });

  const confirmedOrder = Object.freeze({
    ...input.order,
    status: "CONFIRMED" as const,
    creditStatus:
      decision.status === "CLEAR"
        ? ("CLEAR" as const)
        : ("OVERRIDDEN" as const),
    creditDecisionSnapshot: structuredClone(decision) as unknown as Record<
      string,
      unknown
    >,
    confirmedAt: input.confirmedAt,
  });
  const requirements = input.lines.map<FulfillmentRequirement>((line) =>
    Object.freeze({
      id: `fulfillment-${line.id}`,
      salesOrderId: input.order.id,
      salesOrderLineId: line.id,
      requirementType: "MATERIAL_DELIVERY",
      status: "PENDING_READINESS",
      requiredQuantity: line.orderedQuantity,
      uomId: line.uomId,
      uomSymbol: line.uomSymbol,
      customerSiteId: input.order.customerSiteId,
      createdAt: input.confirmedAt,
    }),
  );

  const projectedUninvoicedOrderAmount = (
    Number(input.exposure.uninvoicedOrderAmount) +
    Number(input.order.totalAmount)
  )
    .toFixed(2)
    .replace(/\.00$/, "");
  return {
    order: confirmedOrder,
    requirements,
    projectedUninvoicedOrderAmount,
  };
}
