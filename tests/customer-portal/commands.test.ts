import { describe, expect, it } from "vitest";

import { parseCustomerPortalForm } from "@/modules/customer-portal/commands";

const ID = "72000000-0000-4000-8000-000000000002";
const ID_2 = "72000000-0000-4000-8000-000000000003";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("CP1 customer portal form validation", () => {
  it("accepts a quote request without treating it as a commercial command", () => {
    expect(parseCustomerPortalForm(form({
      kind: "customer.quote.request", requestType: "NEW_QUOTE", customerSiteId: ID,
      materialId: ID_2, quantity: "12.5", uomId: ID, note: "Giao vào buổi sáng",
    }))).toMatchObject({ kind: "customer.quote.request", requestType: "NEW_QUOTE", quantity: "12.5" });
  });

  it("requires an exact source only for reorder or quote-change", () => {
    expect(() => parseCustomerPortalForm(form({
      kind: "customer.quote.request", requestType: "REORDER", customerSiteId: ID,
      materialId: ID_2, quantity: "1", uomId: ID,
    }))).toThrow(/Đơn hàng nguồn/);
    expect(() => parseCustomerPortalForm(form({
      kind: "customer.quote.request", requestType: "QUOTE_CHANGE", customerSiteId: ID,
      materialId: ID_2, quantity: "1", uomId: ID,
    }))).toThrow(/Báo giá nguồn/);
  });

  it("requires a real uploaded path and a usable delivery issue description", () => {
    expect(() => parseCustomerPortalForm(form({
      kind: "customer.payment.notice", amount: "1000", transferredOn: "2026-09-04",
      evidenceStoragePath: "not-uploaded",
    }))).toThrow(/tải chứng từ/);
    expect(() => parseCustomerPortalForm(form({
      kind: "customer.delivery.issue", deliveryId: ID, category: "SHORT_DELIVERY", description: "ngắn",
    }))).toThrow(/ít nhất 10 ký tự/);
  });
});
