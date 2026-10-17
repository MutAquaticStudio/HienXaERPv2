import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), report: vi.fn(), customer: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: mocks.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: mocks.rpc })) }));
vi.mock("@/modules/reports/server", () => ({ availableReportKinds: () => ["payables"], loadFixedReport: mocks.report }));
vi.mock("@/modules/portal/actions", () => ({ getCustomerPortalSnapshot: mocks.customer }));
vi.mock("@/components/portal/payment-notice-form", () => ({ PaymentNoticeForm: () => null }));

import ReportsPage from "@/app/admin/reports/page";
import CustomerDebtsPage from "@/app/customer/debts/page";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionNotice } from "@/components/sales/action-notice";
import { roleLabel } from "@/components/access/presentation";
import { catalogChoiceLabel } from "@/modules/catalog/presentation";
import { deliveryStateLabel, sourceModeLabel, returnCaseKindLabel } from "@/modules/delivery/presentation";
import { activityKindLabel, financeSourceLabel, financeStateLabel, reportQualityLabel } from "@/modules/finance/presentation";
import { inventoryMovementLabel, stockCountStateLabel } from "@/modules/inventory/presentation";
import { invoiceStateLabel } from "@/modules/invoicing/presentation";
import { historicalScopeLabel } from "@/modules/operations/state";
import { workStateLabel, workKindLabel, earningStateLabel, earningKindLabel, customerDocumentKindLabel, customerDocumentStateLabel } from "@/modules/portal/presentation";
import { priceSourceLabel, pricingScopeLabel } from "@/modules/pricing/presentation";
import { purchaseStateLabel } from "@/modules/purchasing/presentation";
import { routePlanStateLabel } from "@/modules/routing/presentation";
import { salesStateLabel } from "@/modules/sales/presentation";
import { earningTypeLabel, earningClassificationLabel, recognitionKindLabel, serviceStateLabel } from "@/modules/workforce/presentation";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ branchId: "branch", permissions: new Set(["dashboard.read", "finance.ap.read"]) });
});
afterEach(cleanup);

describe("Vietnamese display boundaries", () => {
  // Unknown states must stay unknown, including names inherited from Object.prototype.
  const presenters: Array<[string, (value: string) => string]> = [
    ["role", roleLabel], ["catalog", catalogChoiceLabel], ["delivery", deliveryStateLabel],
    ["source mode", sourceModeLabel], ["return case", returnCaseKindLabel],
    ["activity", activityKindLabel], ["finance source", financeSourceLabel], ["finance state", financeStateLabel],
    ["report quality", reportQualityLabel], ["inventory", inventoryMovementLabel], ["stock count", stockCountStateLabel],
    ["invoice", invoiceStateLabel], ["historical data scope", historicalScopeLabel], ["work state", workStateLabel],
    ["work kind", workKindLabel], ["earning state", earningStateLabel], ["earning kind", earningKindLabel],
    ["customer document kind", customerDocumentKindLabel],
    ["customer quote state", value => customerDocumentStateLabel("QUOTATION", value)],
    ["customer delivery state", value => customerDocumentStateLabel("DELIVERY", value)],
    ["customer payment state", value => customerDocumentStateLabel("PAYMENT", value)],
    ["price source", priceSourceLabel], ["price scope", pricingScopeLabel], ["purchase", purchaseStateLabel],
    ["route", routePlanStateLabel], ["sales", salesStateLabel], ["earning type", earningTypeLabel],
    ["classification", earningClassificationLabel], ["recognition", recognitionKindLabel], ["service", serviceStateLabel],
  ];
  it.each(presenters)("%s renders readable fallback rather than an unknown enum or inherited object", (_domain, present) => {
    for (const source of ["UNRECOGNIZED_INTERNAL_STATE", "constructor", "toString", "__proto__"]) {
      const label = present(source);
      expect(typeof label).toBe("string");
      expect(label).toMatch(/[À-ỹĐđ]/u);
      expect(label).not.toContain(source);
      const view = render(<StatusBadge tone="info">{label}</StatusBadge>);
      expect(view.container.textContent).toBe(label);
      expect(view.container.textContent).not.toMatch(/UNRECOGNIZED_INTERNAL_STATE|constructor|toString|__proto__/);
      view.unmount();
    }
  });

  it("renders action feedback without leaking unknown keys or changing a posting block into success", () => {
    for (const notice of ["constructor", "toString", "__proto__"]) {
      const view = render(<ActionNotice notice={notice} />);
      expect(screen.getByRole("status").textContent).toMatch(/[À-ỹĐđ]/u);
      expect(view.container.textContent).not.toContain(notice);
      view.unmount();
    }
    render(<ActionNotice error="branch_not_operational: ordinary posting requires ACTIVE" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Chưa thể ghi sổ");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert").textContent).not.toMatch(/branch_not_operational|ACTIVE/);
  });

  it("renders available financial data without claiming independent reconciliation", async () => {
    mocks.report.mockResolvedValue({
      title: "Công nợ phải trả", totalLabel: "Tổng phải trả", totalVnd: "2000000", quality: "READY",
      rows: [], chart: [], scopeText: "Số dư đến hết 10/10/2026", hasNext: false,
      cutoff: "2026-10-10T09:00:00Z",
    });
    const view = render(await ReportsPage({ searchParams: Promise.resolve({ report: "payables", asOf: "2026-10-10" }) }));
    expect(screen.getByText(/Số dư đến hết 10\/10\/2026/)).toBeInTheDocument();
    expect(view.container.querySelector(".report-cutoff")?.textContent).not.toMatch(/READY|đã đối chiếu|đã đối soát/i);
    expect(view.container.querySelector(".metric-value")?.textContent).toContain("2.000.000");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows the customer's debt without the switched-off payment notices (owner decision D8)", async () => {
    const notice = { id: "notice", state: "ACCEPTED", amount_vnd: "2000000", paid_on: "2026-10-10", reference: "UNC_2026_00012", evidence_id: "evidence" };
    mocks.customer.mockResolvedValue({
      customer: { id: "customer" }, can_view_debt: true,
      debt: { outstanding_amount_vnd: "2000000", overdue_amount_vnd: "0", items: [] },
      payment_notices: [notice],
    });
    const view = render(await CustomerDebtsPage());
    expect(view.container.textContent).toContain("2.000.000");
    expect(view.container.textContent).not.toMatch(/ACCEPTED|Đã ghi sổ|Đã tất toán/);
    expect(screen.queryByText("Thông báo đã gửi")).not.toBeInTheDocument();
    expect(screen.queryByText("Thông báo đã chuyển tiền")).not.toBeInTheDocument();
    expect(screen.queryByText(/UNC_2026_00012/)).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps submitted service results waiting for verification", () => {
    render(<StatusBadge tone="warning">{serviceStateLabel("RESULT_SUBMITTED")}</StatusBadge>);
    expect(screen.getByText("Chờ xác minh")).toBeInTheDocument();
    expect(screen.queryByText("Đã xác minh")).not.toBeInTheDocument();
    expect(screen.queryByText("Đã hoàn tất")).not.toBeInTheDocument();
  });
});
