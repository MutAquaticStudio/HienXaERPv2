import { describe, expect, it } from "vitest";

import { parseSaveCustomer360Form } from "@/modules/customer-360/commands";

describe("P3 customer command validation", () => {
  it("normalizes customer codes and validates tiers", () => {
    const form = new FormData();
    form.set("kind", "customer");
    form.set("code", " an-phat ");
    form.set("name", "Công ty An Phát");
    form.set("tier", "GOLD");
    expect(parseSaveCustomer360Form(form)).toMatchObject({
      kind: "customer",
      code: "AN-PHAT",
      tier: "GOLD",
    });
  });

  it("rejects a price-rule target that does not match its precedence level", () => {
    const form = new FormData();
    form.set("kind", "price-rule");
    form.set("scope", "CUSTOMER_MATERIAL_GROUP");
    form.set("customerId", "customer-001");
    form.set("materialId", "material-001");
    form.set("unitPrice", "100000");
    form.set("currency", "VND");
    form.set("uomId", "uom-001");
    form.set("validFrom", "2026-09-01");
    form.set("changeReason", "Điều chỉnh theo hợp đồng.");
    expect(() => parseSaveCustomer360Form(form)).toThrowError(
      /đối tượng áp dụng/i,
    );
  });

  it("rejects unsafe money precision before PostgreSQL", () => {
    const form = new FormData();
    form.set("kind", "credit-policy");
    form.set("customerId", "customer-001");
    form.set("creditLimit", "100.123");
    form.set("allowedOverdueDays", "15");
    form.set("validFrom", "2026-09-01");
    form.set("changeReason", "Hạn mức được phê duyệt.");
    expect(() => parseSaveCustomer360Form(form)).toThrowError(/2 chữ số/i);
  });

  it("requires at least one contact channel", () => {
    const form = new FormData();
    form.set("kind", "contact");
    form.set("customerId", "customer-001");
    form.set("name", "Chị Lan");
    expect(() => parseSaveCustomer360Form(form)).toThrowError(
      /điện thoại hoặc email/i,
    );
  });
});
