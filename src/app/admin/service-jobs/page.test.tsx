import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => "/admin/service-jobs", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/modules/workforce/actions", () => ({ createServiceJobAction: vi.fn() }));
vi.mock("@/components/workforce/service-job-location-fields", () => ({ ServiceJobLocationFields: () => <p>Chọn khách</p> }));
vi.mock("@/components/workforce/service-job-resource-field", () => ({ ServiceJobResourceField: ({ label }: { label: string }) => <p>{label}</p> }));
vi.mock("@/components/workforce/service-type-fields", () => ({ ServiceTypeFields: () => <p>Loại dịch vụ</p> }));
vi.mock("@/modules/catalog/editor-data", () => ({ catalogEditorScope: () => "scope" }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    for (const method of ["select", "in", "order", "or", "range", "limit"]) query[method] = () => query;
    query.eq = (column: string, value: unknown) => { filters[column] = value; return query; };
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      const rows = (m.tables[table] ?? []).filter((row) => !filters.execution_state || (row as { execution_state?: string }).execution_state === filters.execution_state);
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    };
    return query;
  },
}) }));

import Page from "./page";

const base = { job_number: "DV-1", service_type: "Xe chở hàng", scheduled_start: "2026-10-23T01:00:00Z", unit_label: "chuyến" };
beforeEach(() => {
  m.permissions = new Set(["service.read", "service.manage"]);
  m.tables = {
    service_jobs: [
      { ...base, id: "a", planned_quantity: null, execution_state: "SCHEDULED" },
      { ...base, id: "b", job_number: "DV-2", planned_quantity: "3", execution_state: "RESULT_SUBMITTED" },
    ],
    service_job_read: [
      { id: "a", customer_name: "Khách A", site_name: "CT A", operator_name: null },
      { id: "b", customer_name: "Khách B", site_name: "CT B", operator_name: "Thợ 01" },
    ],
  };
});
afterEach(cleanup);

it("lists jobs with tabs and the count to be measured on site", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { name: "Đơn dịch vụ" })).toBeInTheDocument();
  expect(screen.getByText("Theo thực tế")).toBeInTheDocument();
  expect(screen.getByText("3 chuyến")).toBeInTheDocument();
  expect(screen.getByText("Chưa giao")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Chờ xác minh/ })).toHaveTextContent("1");
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo đơn dịch vụ" }));
  expect(screen.getByRole("dialog", { name: "Tạo đơn dịch vụ" })).toBeInTheDocument();
  expect(screen.getByText("Thêm (không bắt buộc)")).toBeInTheDocument();
  expect(screen.getByLabelText("Ghi chú công việc")).not.toBeRequired();
  expect(screen.getByLabelText("Kết thúc dự kiến")).toBeInTheDocument();
});

it("hides the create button from readers", async () => {
  m.permissions = new Set(["service.read"]);
  render(await Page({ searchParams: Promise.resolve({ state: "SCHEDULED" }) }));
  expect(screen.queryByRole("button", { name: "+ Tạo đơn dịch vụ" })).not.toBeInTheDocument();
  expect(screen.queryByText("DV-2")).not.toBeInTheDocument();
});
