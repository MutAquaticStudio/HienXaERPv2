import { describe, expect, it } from "vitest";

import { parseCommercialForm } from "@/modules/commercial/commands";

describe("P4 commercial command validation", () => {
  it("parses a quotation with a real valid-until date", () => {
    const form = new FormData();
    form.set("kind", "quotation.create");
    form.set("customerId", "customer-an-phat");
    form.set("customerSiteId", "site-an-phat-dong-anh");
    form.set("validUntil", "2026-09-30");
    form.set("notes", "Giao theo tiến độ công trình.");
    expect(parseCommercialForm(form, "2026-09-01")).toMatchObject({
      kind: "quotation.create",
      validUntil: "2026-09-30",
    });
  });

  it("rejects expired quote dates and unsafe quantities", () => {
    const quote = new FormData();
    quote.set("kind", "quotation.create");
    quote.set("customerId", "customer-an-phat");
    quote.set("validUntil", "2026-08-31");
    expect(() => parseCommercialForm(quote, "2026-09-01")).toThrowError(
      /không được trước ngày hiện tại/i,
    );

    const line = new FormData();
    line.set("kind", "quotation.add-line");
    line.set("revisionId", "revision-draft-001");
    line.set("materialId", "material-cement-pcb40");
    line.set("quantity", "0");
    line.set("uomId", "uom-bag");
    expect(() => parseCommercialForm(line, "2026-09-01")).toThrowError(
      /số lượng phải lớn hơn 0/i,
    );
  });
});
