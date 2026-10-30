import { customerDeliveryStateLabel, portalOrderProgress } from "./presentation";
import type { CustomerOrder } from "./types";

export type JourneyStep = { key: string; label: string; state: "done" | "current" | "todo"; at?: string; approx?: boolean };

const delivered = (state?: string) => state === "VERIFIED" || state === "RESULT_SUBMITTED";

/**
 * Concept "Khách · Theo dõi đơn" — "Hành trình đơn": placed, accepted by the shop, each delivery with its time (done when
 * delivered, current while on its way), then "Giao xong · có ảnh tại công trình". Nothing for a cancelled order.
 */
export function orderJourney(order: Pick<CustomerOrder, "state" | "channel" | "fulfillment_state" | "ordered_at" | "deliveries">): JourneyStep[] | null {
  const progress = portalOrderProgress(order);
  if (!progress) return null;
  const steps: JourneyStep[] = [
    { key: "placed", label: order.channel === "CUSTOMER_PORTAL" ? "Đã gửi đơn" : "Đã đặt đơn", state: "done", at: order.ordered_at },
    { key: "accepted", label: order.channel === "CUSTOMER_PORTAL" ? "Cửa hàng đã nhận đơn" : "Cửa hàng đã xác nhận", state: progress[1].state === "done" ? "done" : "current" },
  ];
  const deliveries = order.deliveries.filter((delivery) => delivery.state !== "CANCELLED");
  for (const [index, delivery] of deliveries.entries()) {
    const name = deliveries.length > 1 ? `Lượt giao ${index + 1}: ` : "";
    const done = delivered(delivery.state);
    steps.push({ key: delivery.id, label: name + (done ? "Đã giao" : delivery.state === "DISPATCHED" || delivery.state === "ARRIVED" ? "Đang trên đường tới" : customerDeliveryStateLabel(delivery.state)),
      state: done ? "done" : "todo", at: done ? delivery.delivered_at : delivery.scheduled_at, approx: !done });
  }
  const finished = progress[3].state === "done";
  steps.push({ key: "finished", label: "Giao xong · có ảnh tại công trình", state: finished ? "done" : "todo" });
  // The first step not done yet is the one in progress.
  const current = steps.findIndex((step) => step.state !== "done");
  if (current >= 0) steps[current] = { ...steps[current], state: "current" };
  return steps;
}
