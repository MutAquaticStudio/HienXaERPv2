import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/modules/workforce/actions", () => Object.fromEntries(["assignWorkItemAction", "calculateEarningAction", "claimWorkItemAction",
  "heartbeatWorkItemAction", "cancelScheduledServiceJobAction", "publishWorkItemAction", "startWorkItemAction", "submitWorkResultAction",
  "verifyServiceJobAction"].map((name) => [name, vi.fn()])));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "limit"]) query[method] = () => query;
    const rows = m.tables[table] ?? [];
    query.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    const result = Promise.resolve({ data: rows, error: null });
    query.then = result.then.bind(result);
    return query;
  },
}) }));

import Page from "./page";

const job = {
  id: "job", job_number: "DV-2026-000001", customer_name: "Khách A", site_name: "Công trình A", service_type: "Xe chở hàng",
  description: "Dịch vụ Xe chở hàng", scheduled_start: "2026-10-23T01:00:00Z", planned_quantity: null, unit_label: "chuyến",
  plate_number: "99C-260.01", machine_name: null, execution_state: "SCHEDULED", version: 1, work_item_id: null, work_number: null,
  work_state: null, work_version: null, operator_name: null, actual_quantity: null, billable_quantity: null, compensable_quantity: null,
  billable_amount_vnd: null, service_verification_id: null, receivable_obligation_id: null,
};
beforeEach(() => {
  m.permissions = new Set(["service.read", "service.manage", "work.manage", "work.claim", "service.verify"]);
  m.tables = { service_job_read: [job], workforce_read: [{ id: "w1", code: "T01", display_name: "Thợ 01" }], compensation_rules: [],
    service_jobs: [{ unit_price_vnd: "450000" }] };
});
afterEach(cleanup);
const page = async () => render(await Page({ params: Promise.resolve({ id: "job" }), searchParams: Promise.resolve({}) }));

it("schedules without a known count and offers to hand the job to a worker", async () => {
  await page();
  expect(screen.getByRole("heading", { name: "Xe chở hàng" })).toBeInTheDocument();
  expect(screen.getByText("Theo thực tế")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Tiến trình đơn dịch vụ" })).toHaveTextContent("Bước tiếp theo: giao việc cho thợ");
  expect(screen.getByLabelText("Giao thẳng cho một thợ")).toBeChecked();
  expect(screen.getByRole("button", { name: "Giao việc" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hủy đơn dịch vụ" })).toBeInTheDocument();
  expect(screen.getByText("450.000 ₫/chuyến")).toBeInTheDocument();
});

it("lets the office finish for the worker with + / − from the estimate", async () => {
  m.tables.service_job_read = [{ ...job, planned_quantity: "3.000000", execution_state: "IN_PROGRESS", work_item_id: "work", work_number: "WRK-1",
    work_state: "IN_PROGRESS", work_version: 2, operator_name: "Thợ 01" }];
  await page();
  expect(screen.getByText("Thợ 01 đang làm. Xong việc thợ bấm số chuyến thực tế và “Hoàn tất” trên điện thoại.")).toBeInTheDocument();
  const quantity = screen.getByLabelText("Số lượng thực tế");
  expect(quantity).toHaveValue("3");
  fireEvent.click(screen.getByRole("button", { name: "Thêm 1 · Số lượng thực tế" }));
  expect(quantity.closest("form")!.querySelector<HTMLInputElement>("input[name=actualQuantity]")!.value).toBe("4");
  expect(screen.getByLabelText("Ghi chú (không bắt buộc)")).not.toBeRequired();
  expect(screen.getByText("1.350.000 ₫")).toBeInTheDocument();
});

it("verifies the reported count and bills it, the note being optional", async () => {
  m.tables.service_job_read = [{ ...job, execution_state: "RESULT_SUBMITTED", work_item_id: "work", work_number: "WRK-1", work_state: "DONE",
    work_version: 3, operator_name: "Thợ 01", actual_quantity: "5" }];
  await page();
  const form = screen.getByRole("button", { name: "Xác minh & ghi công nợ" }).closest("form")!;
  expect(within(form).getByText(/Thợ báo/)).toHaveTextContent("Thợ báo 5 chuyến");
  expect(within(form).getByLabelText("Số lượng tính khách")).toHaveValue("5");
  expect(within(form).getByLabelText("Giá trị tính khách (VND)")).toHaveValue("2.250.000");
  fireEvent.click(within(form).getByRole("button", { name: "Bớt 1 · Số lượng tính khách" }));
  expect(within(form).getByLabelText("Giá trị tính khách (VND)")).toHaveValue("1.800.000");
  expect(within(form).getByLabelText("Số lượng tính công cho thợ")).toHaveValue("5");
  expect(within(form).getByLabelText("Ghi chú (không bắt buộc)")).not.toBeRequired();
  expect(screen.getByText("Thành tiền tạm tính")).toBeInTheDocument();
});

it("shows a cancelled job without commands", async () => {
  m.tables.service_job_read = [{ ...job, execution_state: "CANCELLED" }];
  await page();
  expect(screen.getByText("Đơn dịch vụ đã hủy; không giao việc hay ghi kết quả được nữa.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Giao việc" })).not.toBeInTheDocument();
});
