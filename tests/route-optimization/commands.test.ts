import { describe, expect, it } from "vitest";

import { parseRoutePlanForm } from "@/modules/route-optimization/commands";

const ID = "72000000-0000-4000-8000-000000000002";
const ID_2 = "72000000-0000-4000-8000-000000000003";

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry);
  }
  return data;
}

describe("RO1 route plan form validation", () => {
  it("requires a dated, unique Delivery selection", () => {
    expect(parseRoutePlanForm(form({
      kind: "route.plan.create", scheduledDate: "2026-09-01", vehicleId: ID,
      driverUserId: ID_2, deliveryId: [ID, ID_2],
    }))).toMatchObject({ kind: "route.plan.create", deliveryIds: [ID, ID_2] });
    expect(() => parseRoutePlanForm(form({
      kind: "route.plan.create", scheduledDate: "2026-02-30", vehicleId: ID,
      driverUserId: ID_2, deliveryId: ID,
    }))).toThrow(/Ngày chạy/);
    expect(() => parseRoutePlanForm(form({
      kind: "route.plan.create", scheduledDate: "2026-09-01", vehicleId: ID,
      driverUserId: ID_2, deliveryId: [ID, ID],
    }))).toThrow(/một lần/);
  });

  it("requires a reason and explicit confirmation before P7 apply", () => {
    expect(() => parseRoutePlanForm(form({
      kind: "route.plan.apply", routePlanId: ID, reason: "Đã kiểm tra đầy đủ", confirmApply: "no",
    }))).toThrow(/xác nhận thao tác/);
    expect(() => parseRoutePlanForm(form({
      kind: "route.plan.approve", routePlanId: ID, reason: "ngắn",
    }))).toThrow(/ít nhất 10 ký tự/);
    expect(parseRoutePlanForm(form({
      kind: "route.plan.apply", routePlanId: ID, reason: "Đã xác nhận điều phối đầy đủ.", confirmApply: "apply-p7",
    }))).toMatchObject({ kind: "route.plan.apply", confirmApply: true });
  });
});
