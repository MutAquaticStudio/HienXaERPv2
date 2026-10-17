import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ delivery: vi.fn(), work: vi.fn(), permissions: new Set<string>() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b1", permissions: m.permissions }) }));
vi.mock("@/modules/workforce/delivery-actions", () => ({ publishDeliveryWorkItemAction: vi.fn(), verifyDeliveryWorkItemAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ from: (table: string) => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: table === "delivery_read" ? m.delivery : m.work };
  return chain;
} }) }));

import { DeliveryWorkItemBridge } from "./work-item-bridge";

const assigned = { execution_state: "ASSIGNED", scheduled_at: "2026-10-18T02:00:00Z", employee_id: "e1", receiver_name_snapshot: "Anh Nhận", receiver_phone_snapshot: "0901", delivery_address_snapshot: "Số 1" };
beforeEach(() => { m.permissions = new Set(["delivery.read", "workforce.read", "work.manage"]); m.work.mockResolvedValue({ data: null, error: null }); });
afterEach(cleanup);

it("shows who got the job once assigning the driver made it", async () => {
  m.delivery.mockResolvedValue({ data: assigned, error: null });
  m.work.mockResolvedValue({ data: { id: "w1", work_number: "WRK-202610-000001", execution_state: "CLAIMED", version: 1, employee_name: "Tài xế A", scheduled_start: "2026-10-18T02:00:00Z" }, error: null });
  render(await DeliveryWorkItemBridge({ deliveryId: "d1" }));
  expect(screen.getByText(/Đã giao việc cho/)).toHaveTextContent("Đã giao việc cho Tài xế A · 18/10/2026 09:00");
  expect(screen.queryByRole("button", { name: "Giao việc qua cổng thợ" })).not.toBeInTheDocument();
});

it("asks for the receiver when that is all the job waits for", async () => {
  m.delivery.mockResolvedValue({ data: { ...assigned, receiver_phone_snapshot: null }, error: null });
  render(await DeliveryWorkItemBridge({ deliveryId: "d1" }));
  expect(screen.getByRole("status")).toHaveTextContent("Việc chưa sang cổng thợ vì thiếu");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("keeps the manual button for a delivery assigned before automatic work items", async () => {
  m.delivery.mockResolvedValue({ data: assigned, error: null });
  render(await DeliveryWorkItemBridge({ deliveryId: "d1" }));
  expect(screen.getByRole("button", { name: "Giao việc qua cổng thợ" })).toBeInTheDocument();
});
