import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CloseRemainingForm } from "./close-remaining-form";

vi.mock("./actions", () => ({ closeSalesOrderRemainingAction: vi.fn() }));
const props = { orderId: "a3cc4dcf-aa24-44c7-9186-c631a5571d7a", commercialState: "CONFIRMED", fulfillmentState: "PARTIAL", canClose: true };
describe("close remaining UI contract", () => {
  it("keeps an optional note and operation identity on an eligible partial order", () => {
    const html = renderToStaticMarkup(<CloseRemainingForm {...props} />);
    expect(html).toContain(props.orderId);
    expect(html).toContain('name="operationId"');
    expect(html).toContain('name="reason"');
    expect(html).toContain("Ghi chú (không bắt buộc)");
    expect(html).not.toContain("required");
    expect(html).not.toContain("minLength");
    expect(html).toContain('maxLength="500"');
  });
  it.each(["DRAFT", "CLOSED", "CANCELLED"])("does not expose the command in %s", (commercialState) => {
    expect(renderToStaticMarkup(<CloseRemainingForm {...props} commercialState={commercialState} />)).toBe("");
  });
  it("hides without the exact permission", () => {
    expect(renderToStaticMarkup(<CloseRemainingForm {...props} canClose={false} />)).toBe("");
  });
  it("hides when all quantity was fulfilled", () => {
    expect(renderToStaticMarkup(<CloseRemainingForm {...props} fulfillmentState="FULFILLED" />)).toBe("");
  });
});
