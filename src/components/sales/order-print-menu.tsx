import { ChevronDown, Printer } from "lucide-react";

/** One "In" button for an order's print outs (A4 PDF, 80 mm receipt) instead of a button per paper size. */
export function OrderPrintMenu({ orderId }: { orderId: string }) {
  return <details className="more-actions">
    <summary className="button button-secondary"><Printer aria-hidden size={16} />In<ChevronDown aria-hidden size={16} /></summary>
    <div className="more-actions-menu">
      <a href={`/api/orders/${orderId}/pdf`}>Đơn bán khổ A4 (PDF)</a>
      <a href={`/api/orders/${orderId}/pdf?kho=k80`}>Hóa đơn in nhiệt K80</a>
    </div>
  </details>;
}
