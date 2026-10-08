import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReturnCaseHistory } from "./return-case-history";
const row = { id: "daf782d1-9e3e-452d-abeb-3c047959125d", case_kind: "CUSTOMER_RETURN", base_quantity: "1.000000", reason: "LIVE-UAT verified customer return", state: "RETURNED", version: 2 };
describe("resolved return history", () => {
  it("preserves source, quantity, reason, state and version without commands", () => {
    const html = renderToStaticMarkup(<ReturnCaseHistory cases={[row]} />);
    for (const value of [row.id, row.base_quantity, row.reason, row.state, "v2"]) expect(html).toContain(value);
    expect(html).not.toContain("<form"); expect(html).not.toContain("<button");
  });
  it("does not duplicate OPEN resolution forms", () => {
    expect(renderToStaticMarkup(<ReturnCaseHistory cases={[{ ...row, state: "OPEN" }]} />)).toBe("");
  });
  it.each(["LOSS_APPROVED", "CANCELLED"])("keeps %s history visible", (state) => {
    expect(renderToStaticMarkup(<ReturnCaseHistory cases={[{ ...row, state }]} />)).toContain(state);
  });
  it("leaves the supplied source rows unchanged", () => {
    const input = [{ ...row }]; const before = JSON.stringify(input);
    renderToStaticMarkup(<ReturnCaseHistory cases={input} />); expect(JSON.stringify(input)).toBe(before);
  });
  it("escapes saved reasons rather than executing markup", () => {
    const html = renderToStaticMarkup(<ReturnCaseHistory cases={[{ ...row, reason: "<script>alert(1)</script>" }]} />);
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
  });
});
