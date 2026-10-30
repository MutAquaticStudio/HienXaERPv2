import { expect, it } from "vitest";
import { orderJourney } from "./journey";

it("lists the order journey with the delivery on its way as the current step (concept Theo dõi đơn)", () => {
  const steps = orderJourney({ state: "CONFIRMED", channel: "CUSTOMER_PORTAL", fulfillment_state: "PARTIAL", ordered_at: "2026-10-29T09:05:00Z", deliveries: [
    { id: "d1", state: "VERIFIED", delivered_at: "2026-10-30T02:42:00Z" },
    { id: "d2", state: "DISPATCHED", scheduled_at: "2026-10-30T03:45:00Z" },
    { id: "d3", state: "CANCELLED" },
  ] })!;
  expect(steps.map((step) => `${step.label}|${step.state}`)).toEqual([
    "Đã gửi đơn|done", "Cửa hàng đã nhận đơn|done", "Lượt giao 1: Đã giao|done", "Lượt giao 2: Đang trên đường tới|current", "Giao xong · có ảnh tại công trình|todo"]);
  expect(steps[3]).toMatchObject({ at: "2026-10-30T03:45:00Z", approx: true });
  expect(orderJourney({ state: "CANCELLED", deliveries: [] })).toBeNull();
  expect(orderJourney({ state: "DRAFT", channel: "CUSTOMER_PORTAL", deliveries: [] })!.map((step) => step.state)).toEqual(["done", "current", "todo"]);
});
