import { describe, expect, it } from "vitest";

import { SYNTHETIC_CUSTOMER_360 } from "@/modules/customer-360/fixtures";
import {
  acceptQuotationRevision,
  confirmSalesOrder,
  convertAcceptedQuotation,
  refreshDraftPrices,
  sendQuotationRevision,
} from "@/modules/commercial/workflow";
import { SYNTHETIC_COMMERCIAL } from "@/modules/commercial/fixtures";

describe("P4 quotation and sales-order workflow", () => {
  it("refreshes prices only while a revision is draft", () => {
    const draft = SYNTHETIC_COMMERCIAL.revisions.find(
      (item) => item.status === "DRAFT",
    )!;
    const lines = SYNTHETIC_COMMERCIAL.quotationLines.filter(
      (item) => item.revisionId === draft.id,
    );

    const refreshed = refreshDraftPrices({
      revision: draft,
      lines,
      resolve: () => ({ unitPrice: "90000", priceRuleId: "rule-new" }),
      refreshedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(refreshed[0]).toMatchObject({
      unitPrice: "90000",
      referenceUnitPrice: "90000",
      priceRuleId: "rule-new",
    });

    expect(() =>
      refreshDraftPrices({
        revision: { ...draft, status: "SENT" },
        lines,
        resolve: () => ({ unitPrice: "91000", priceRuleId: "rule-newer" }),
        refreshedAt: "2026-09-01T11:00:00.000Z",
      }),
    ).toThrowError(/đã gửi.*không thể làm mới giá/i);
  });

  it("locks sent and accepted versions and converts the accepted snapshot", () => {
    const draft = SYNTHETIC_COMMERCIAL.revisions.find(
      (item) => item.status === "DRAFT",
    )!;
    const sent = sendQuotationRevision(draft, "2026-09-01T10:00:00.000Z");
    const accepted = acceptQuotationRevision(sent, "2026-09-01T11:00:00.000Z");
    expect(accepted.status).toBe("ACCEPTED");
    expect(() =>
      sendQuotationRevision(accepted, "2026-09-01T12:00:00.000Z"),
    ).toThrowError(/chỉ gửi.*bản nháp/i);

    const quotation = SYNTHETIC_COMMERCIAL.quotations.find(
      (item) => item.id === draft.quotationId,
    )!;
    const quoteLines = SYNTHETIC_COMMERCIAL.quotationLines.filter(
      (item) => item.revisionId === draft.id,
    );
    const converted = convertAcceptedQuotation({
      quotation,
      revision: accepted,
      lines: quoteLines,
      orderId: "order-from-quote",
      orderNumber: "SO-2026-0002",
      convertedAt: "2026-09-01T11:30:00.000Z",
    });

    expect(converted.order).toMatchObject({
      quotationRevisionId: accepted.id,
      status: "DRAFT",
    });
    expect(converted.lines[0]).toMatchObject({
      unitPrice: quoteLines[0]?.unitPrice,
      uomSymbol: quoteLines[0]?.uomSymbol,
      priceSnapshotId: quoteLines[0]?.priceSnapshotId,
    });
  });

  it("confirms with credit control, creates fulfillment, and never creates AR", () => {
    const order = SYNTHETIC_COMMERCIAL.salesOrders[0]!;
    const lines = SYNTHETIC_COMMERCIAL.salesOrderLines.filter(
      (item) => item.salesOrderId === order.id,
    );
    const policy = SYNTHETIC_CUSTOMER_360.creditPolicies.find(
      (item) => item.customerId === order.customerId,
    )!;
    const exposure = SYNTHETIC_CUSTOMER_360.creditExposures.find(
      (item) => item.customerId === order.customerId,
    )!;

    const result = confirmSalesOrder({
      order,
      lines,
      policy,
      exposure,
      canOverrideCredit: false,
      overrideReason: "",
      confirmedAt: "2026-09-01T12:00:00.000Z",
    });

    expect(result.order.status).toBe("CONFIRMED");
    expect(result.requirements).toHaveLength(lines.length);
    expect(result.requirements[0]?.status).toBe("PENDING_READINESS");
    expect(result).not.toHaveProperty("receivable");
    expect(result).not.toHaveProperty("arEntry");
  });

  it("requires explicit credit override permission and a meaningful reason", () => {
    const blockedOrder = {
      ...SYNTHETIC_COMMERCIAL.salesOrders[0]!,
      customerId: "customer-minh-tam",
      totalAmount: "1000000",
    };
    const lines = SYNTHETIC_COMMERCIAL.salesOrderLines.map((line) => ({
      ...line,
      salesOrderId: blockedOrder.id,
    }));
    const policy = SYNTHETIC_CUSTOMER_360.creditPolicies.find(
      (item) => item.customerId === blockedOrder.customerId,
    )!;
    const exposure = SYNTHETIC_CUSTOMER_360.creditExposures.find(
      (item) => item.customerId === blockedOrder.customerId,
    )!;

    expect(() =>
      confirmSalesOrder({
        order: blockedOrder,
        lines,
        policy,
        exposure,
        canOverrideCredit: false,
        overrideReason: "Đã được duyệt",
        confirmedAt: "2026-09-01T12:00:00.000Z",
      }),
    ).toThrowError(/không có quyền vượt chặn/i);

    expect(() =>
      confirmSalesOrder({
        order: blockedOrder,
        lines,
        policy,
        exposure,
        canOverrideCredit: true,
        overrideReason: "Duyệt",
        confirmedAt: "2026-09-01T12:00:00.000Z",
      }),
    ).toThrowError(/ít nhất 10 ký tự/i);
  });
});
