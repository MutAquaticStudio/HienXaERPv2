import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { earningCommandError } from "./earning-command-error";
import { EarningSourceTrace } from "./earning-source-trace";
describe("earning recognition presentation", () => {
  it.each(["23505", "PT409", "42501", "22023", "23514", "55000", "XX000"])("does not expose database details for %s", code => {
    expect(earningCommandError({ code, message: "secret constraint earning_events_source_key_rule_id_employee_id_key" })).not.toMatch(/secret|constraint|earning_events/);
  });
  it("shows allocation, canonical AR/SO, rate and reversal source without commands", () => {
    const source = { source_key: "AR_PAYMENT_ALLOCATION:allocation", payment_allocation_id: "allocation", payment_id: "payment", receivable_obligation_id: "obligation", sales_order_id: "sales-order", basis_amount_vnd: "2000000", rate_bps_snapshot: 100, reverses_earning_event_id: "original" };
    const html = renderToStaticMarkup(<EarningSourceTrace source={source} />);
    for (const value of ["allocation", "payment", "obligation", "sales-order", "2.000.000", "1,00%", "original"]) expect(html).toContain(value);
    expect(html).not.toMatch(/<form|<button/);
  });
  it("keeps Worker verification source distinct from allocation", () => {
    const html = renderToStaticMarkup(<EarningSourceTrace source={{ source_key: "WORK_ITEM_VERIFICATION:v", work_item_verification_id: "verification" }} />);
    expect(html).toContain("Xác minh của chủ doanh nghiệp: verification"); expect(html).not.toContain("Phân bổ tiền thu");
  });
});
