import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReturnCaseHistory } from "./return-case-history";
const row = { id: "daf782d1-9e3e-452d-abeb-3c047959125d", case_kind: "CUSTOMER_RETURN", base_quantity: "1.000000", reason: "LIVE-UAT verified customer return", state: "RETURNED", version: 2 };
describe("resolved return history", () => {
  it("preserves source, quantity, reason, state and version without commands", () => {
    const html = renderToStaticMarkup(<ReturnCaseHistory cases={[row]} />);
    for (const value of [row.id, row.reason, "1 đơn vị cơ sở", "Đã nhận về kho", "Phiên bản 2"]) expect(html).toContain(value);
    expect(html).not.toContain(row.state);
    expect(html).not.toContain("<form"); expect(html).not.toContain("<button");
  });
  it("does not duplicate OPEN resolution forms", () => {
    expect(renderToStaticMarkup(<ReturnCaseHistory cases={[{ ...row, state: "OPEN" }]} />)).toBe("");
  });
  it.each([["LOSS_APPROVED", "Đã duyệt hao hụt"], ["CANCELLED", "Đã hủy hồ sơ"]])("keeps %s history visible", (state, label) => {
    const html = renderToStaticMarkup(<ReturnCaseHistory cases={[{ ...row, state }]} />);
    expect(html).toContain(label);
    expect(html).not.toContain(state);
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

it("labels the canonical TRANSIT_REMAINDER enum without changing stored state", () => {
  const input = { ...row, case_kind: "TRANSIT_REMAINDER" };
  const html = renderToStaticMarkup(<ReturnCaseHistory cases={[input]} />);
  expect(html).toContain("Ph\u1ea7n ch\u01b0a giao tr\u1ea3 kho");
  expect(html).not.toContain("TRANSIT_REMAINDER");
  expect(input.case_kind).toBe("TRANSIT_REMAINDER");
  expect(html).toContain("Đã nhận về kho");
  expect(html).not.toContain("RETURNED");
});

it.each(["FUTURE_CASE", "constructor", "toString", "__proto__"])("keeps unknown historical cases readable without showing internal enums: %s", (unknown) => {
  const input = { ...row, case_kind: unknown, state: unknown };
  const before = JSON.stringify(input);
  const html = renderToStaticMarkup(<ReturnCaseHistory cases={[input]} />);
  expect(html).toContain("Hồ sơ xử lý giao hàng");
  expect(html).toContain("Chưa xác định trạng thái");
  expect(html).not.toContain(unknown);
  expect(JSON.stringify(input)).toBe(before);
});
