import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { deliveryStateLabel } from "@/modules/delivery/presentation";
import { purchaseStateLabel } from "@/modules/purchasing/presentation";

export type NextStepDelivery = { id: string; number: string; state: string; scheduledAt: string | null; vehicle: string | null; driver: string | null; assigned: boolean };
export type NextStepPurchase = { id: string; number: string; state: string };

/** Where a delivery of the order stands, in the words of the FB7 flow (staff assign, the worker loads and delivers). */
export function nextStepDeliveryText(delivery: NextStepDelivery) {
  if (delivery.state === "PLANNED") return "chờ phân xe, tài xế";
  if (delivery.state === "CANCELLED") return "đã hủy";
  const who = [delivery.vehicle && `xe ${delivery.vehicle}`, delivery.driver && `tài xế ${delivery.driver}`, delivery.scheduledAt && formatBusinessDateTime(delivery.scheduledAt)].filter(Boolean).join(" · ");
  const where = delivery.state === "ASSIGNED" ? "đã giao việc qua cổng thợ, chờ thợ lấy hàng lên xe"
    : delivery.state === "DISPATCHED" || delivery.state === "ARRIVED" ? "thợ đang giao"
      : delivery.state === "RESULT_SUBMITTED" ? "thợ đã báo giao, cần xác minh tay"
        : delivery.state === "VERIFIED" ? "đã giao xong" : deliveryStateLabel(delivery.state);
  return who ? `${who} — ${where}` : where;
}

/**
 * FB5/FB7 (Owner: "xác nhận xong yêu cầu hành động tiếp theo"; the card must stay after visiting a delivery): for a confirmed
 * order one card says what the system already did (deliveries and where they are, supplier orders waiting, what the customer
 * still owes) and offers the usual next moves — Thu tiền, In đơn, Tạo đơn mới — so nobody has to look for them.
 */
export function OrderNextSteps({ orderId, orderNumber, customerId, siteId, deliveries, purchases, remainingVnd, can, justConfirmed = false, delivered = false }: {
  orderId: string; orderNumber: string; customerId: string; siteId: string; deliveries: NextStepDelivery[]; purchases: NextStepPurchase[];
  remainingVnd: string | null; can: { collect: boolean; createOrder: boolean; createDelivery: boolean; purchases: boolean };
  justConfirmed?: boolean; delivered?: boolean;
}) {
  const waitingPurchases = purchases.filter((purchase) => purchase.state === "DRAFT");
  const title = justConfirmed ? `Đã xác nhận ${orderNumber} — bước tiếp theo` : delivered ? `${orderNumber} đã giao xong` : `Tiến độ đơn ${orderNumber}`;
  return <section className="card card-pad order-next-steps" aria-labelledby="order-next-steps-title">
    <h2 id="order-next-steps-title">{title}</h2>
    <ul>
      {deliveries.map((delivery) => <li key={delivery.id}>
        <span>Phiếu giao <Link className="code-link mono" href={`/admin/deliveries/${delivery.id}`}>{delivery.number}</Link>{" · "}{nextStepDeliveryText(delivery)}</span>
        {delivery.state === "PLANNED" && <Link className="code-link" href={`/admin/deliveries/${delivery.id}`}>Phân xe</Link>}
      </li>)}
      {waitingPurchases.map((purchase) => <li key={purchase.id}>
        <span>Đơn mua NCC giao thẳng <Link className="code-link mono" href={`/admin/purchase-orders/${purchase.id}`}>{purchase.number}</Link> · {purchaseStateLabel(purchase.state)}</span>
        {can.purchases && <Link className="code-link" href={`/admin/purchase-orders/${purchase.id}`}>Duyệt đơn mua</Link>}
      </li>)}
      {!deliveries.length && !waitingPurchases.length && <li><span>Chưa có phiếu giao.{can.createDelivery ? " Bấm “Lập phiếu giao” ở khung Hành động tiếp theo." : ""}</span></li>}
      {remainingVnd !== null && <li><span>Khách còn phải trả <strong className="mono">{formatVnd(vnd(remainingVnd))}</strong></span></li>}
    </ul>
    <div className="inline-actions">
      {can.collect && remainingVnd !== "0" && <ButtonLink href={`/admin/receivables?customer=${customerId}`}>Thu tiền</ButtonLink>}
      <ButtonLink href={`/api/orders/${orderId}/pdf`} variant="secondary">In đơn</ButtonLink>
      {can.createOrder && <ButtonLink href={`/admin/orders/new?customer=${customerId}&site=${siteId}`} variant="secondary">Tạo đơn mới cho khách này</ButtonLink>}
    </div>
  </section>;
}
