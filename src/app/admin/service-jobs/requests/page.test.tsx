import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permissions: new Set<string>(), tables: {} as Record<string, unknown[]>, filters: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ authUserId: "user", branchId: "branch", permissions: m.permissions }) }));
vi.mock("@/modules/workforce/service-request-actions", () => ({ scheduleServiceRequestAction: vi.fn(), rejectServiceRequestAction: vi.fn() }));
vi.mock("@/modules/workforce/sales-staff", () => ({ loadSalesStaffOptions: async () => [] }));
vi.mock("@/components/workforce/service-job-resource-field", () => ({ ServiceJobResourceField: ({ label }: { label: string }) => <p>{label}</p> }));
vi.mock("@/components/workforce/service-type-fields", () => ({ ServiceTypeFields: ({ defaultTypeId, defaultQuantity }: { defaultTypeId?: string; defaultQuantity?: string }) => <p>Loại {defaultTypeId} · {defaultQuantity}</p> }));
vi.mock("@/modules/catalog/editor-data", () => ({ catalogEditorScope: () => "scope" }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "in", "order", "limit"]) query[method] = () => query;
    query.eq = (column: string, value: unknown) => { m.filters[`${table}.${column}`] = value; return query; };
    const rows = () => (m.tables[table] ?? []).filter((row) => !m.filters[`${table}.state`] || (row as { state?: string }).state === m.filters[`${table}.state`]);
    query.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
    return query;
  },
}) }));

import ListPage from "./page";
import DetailPage from "./[id]/page";

const row = (fields: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", request_number: "YC-202611-000001", state: "SUBMITTED", version: 1, customer_id: "c", customer_name_snapshot: "Khách A",
  site_name_snapshot: "Công trình Q.7", site_address_snapshot: "12 Nguyễn Văn Linh", service_type_id: "type-1", service_name_snapshot: "Chạc gạch", unit_label_snapshot: "xe cn to",
  unit_price_snapshot_vnd: "340000", quantity: "2", preferred_date: "2026-11-15", preferred_slot: "MORNING", preferred_time: null, contact_name: "Anh Tuấn", contact_phone: "0901 234 567",
  note: "Hẻm nhỏ", created_at: "2026-11-14T10:20:00Z", decided_at: null, decision_reason: null, service_job_id: null, ...fields,
});
beforeEach(() => { m.permissions = new Set(["service.read", "service.manage"]); m.tables = { service_requests: [row()] }; m.filters = {}; });
afterEach(cleanup);
const detail = async (query: { notice?: string } = {}) => render(await DetailPage({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }), searchParams: Promise.resolve(query) }));

it("lists what customers asked for, waiting ones first, with their wish and a link to schedule (D75)", async () => {
  render(await ListPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { name: "Yêu cầu từ khách" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Chờ xác nhận lịch" })).toHaveAttribute("aria-current", "page");
  const table = screen.getByRole("table");
  expect(within(table).getByRole("link", { name: "YC-202611-000001" })).toHaveAttribute("href", "/admin/service-jobs/requests/11111111-1111-4111-8111-111111111111");
  expect(table).toHaveTextContent("Khách A");
  expect(table).toHaveTextContent("2 xe cn to");
  expect(table).toHaveTextContent("15/11");
  expect(table).toHaveTextContent("buổi sáng");
});

it("says so when nothing waits", async () => {
  m.tables = { service_requests: [] };
  render(await ListPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Không có yêu cầu nào đang chờ xác nhận lịch.")).toBeInTheDocument();
});

it("opens a waiting request with the customer's wish, the estimate they saw, and the schedule and reject forms", async () => {
  await detail();
  expect(screen.getByRole("heading", { name: "Chạc gạch · 2 xe cn to" })).toBeInTheDocument();
  expect(screen.getByText("Ghi chú của khách").closest("div")).toHaveTextContent("Hẻm nhỏ");
  expect(screen.getByLabelText("Ghi chú công việc")).toHaveValue("Hẻm nhỏ");
  expect(screen.getByText(/680\.000/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "0901 234 567" })).toHaveAttribute("href", "tel:0901234567");
  // The type and quantity of the request come over into the schedule form; the customer's morning wish starts it at 08:00.
  expect(screen.getByText("Loại type-1 · 2")).toBeInTheDocument();
  expect(screen.getByLabelText("Bắt đầu")).toHaveValue("2026-11-15T08:00");
  expect(screen.getByRole("button", { name: "Xếp lịch" })).toBeInTheDocument();
  expect(screen.getByLabelText("Lý do cho khách")).toBeRequired();
  expect(screen.getByRole("button", { name: "Từ chối yêu cầu" })).toBeInTheDocument();
});

it("shows a reader the request without the forms", async () => {
  m.permissions = new Set(["service.read"]);
  await detail();
  expect(screen.queryByRole("button", { name: "Xếp lịch" })).not.toBeInTheDocument();
  expect(screen.getByText(/chưa có quyền xếp lịch/)).toBeInTheDocument();
});

it("links a scheduled request to its service job and a rejected one shows the reason the customer reads", async () => {
  m.tables = { service_requests: [row({ state: "SCHEDULED", service_job_id: "job-1" })], service_jobs: [{ id: "job-1", job_number: "SRV-202611-000007" }] };
  await detail();
  expect(screen.getByRole("link", { name: "SRV-202611-000007" })).toHaveAttribute("href", "/admin/service-jobs/job-1");
  expect(screen.queryByRole("button", { name: "Xếp lịch" })).not.toBeInTheDocument();
  cleanup();
  m.tables = { service_requests: [row({ state: "REJECTED", decision_reason: "Hết máy trong ngày" })] };
  await detail();
  expect(screen.getByText("Hết máy trong ngày")).toBeInTheDocument();
  expect(screen.getByText("Đã từ chối")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Từ chối yêu cầu" })).not.toBeInTheDocument();
});
