import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ delivery: null as Record<string, unknown> | null }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "branch", permissions: new Set(["delivery.exception"]) }) }));
vi.mock("@/modules/delivery/cancel-planned-action", () => ({ cancelPlannedDeliveryAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from() {
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.eq = () => query;
    query.maybeSingle = async () => ({ data: m.delivery, error: null });
    return query;
  },
}) }));

import Page from "./page";

const delivery = (state: string) => ({ id: "d1", sales_order_id: "o1", delivery_number: "DL-2026-000031", customer_name_snapshot: "Anh Tuấn",
  site_name_snapshot: "Công trình Q.7", execution_state: state, version: 3 });
afterEach(cleanup);

it("lets an assigned delivery that has not run be cancelled and says what happens to the worker's job (D95)", async () => {
  m.delivery = delivery("ASSIGNED");
  render(await Page({ params: Promise.resolve({ id: "d1" }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("button", { name: "Xác nhận hủy kế hoạch" })).toBeInTheDocument();
  expect(screen.getByText(/gỡ phân công, việc của thợ chuyển Đã hủy/)).toBeInTheDocument();
});

it("still refuses a delivery already on the road", async () => {
  m.delivery = delivery("DISPATCHED");
  render(await Page({ params: Promise.resolve({ id: "d1" }), searchParams: Promise.resolve({}) }));
  expect(screen.queryByRole("button", { name: "Xác nhận hủy kế hoạch" })).toBeNull();
  expect(screen.getByText(/Chỉ phiếu chưa lên hàng/)).toBeInTheDocument();
});
