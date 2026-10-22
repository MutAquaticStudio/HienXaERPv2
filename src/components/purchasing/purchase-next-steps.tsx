import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";

/**
 * FB5/FB7 (Owner): while a purchase order is confirmed and open, say what comes next — send it to the supplier, then receive
 * the goods (or have the supplier deliver to the site) — and offer a new order for the same supplier. The steps themselves are
 * the existing ones on this page.
 */
export function PurchaseNextSteps({ number, supplierId, toWarehouse, sent, deliveryCreated, can, justConfirmed = false }: {
  number: string; supplierId: string; toWarehouse: boolean; sent: boolean; deliveryCreated: boolean; justConfirmed?: boolean;
  can: { send: boolean; receive: boolean; create: boolean };
}) {
  return <section className="card card-pad order-next-steps" aria-labelledby="purchase-next-steps-title">
    <h2 id="purchase-next-steps-title">{justConfirmed ? `Đã xác nhận ${number} — bước tiếp theo` : `Bước tiếp theo của ${number}`}</h2>
    <ul>
      {can.send && <li><span>{sent ? "Đã gửi đơn cho NCC." : "Gửi đơn cho NCC qua Zalo (kèm PDF) để NCC chuẩn bị hàng."}</span>{!sent && <Link className="code-link" href="#gui-ncc">Gửi NCC</Link>}</li>}
      {toWarehouse
        ? can.receive && <li><span>Khi hàng về kho: bấm “Nhận đủ” rồi “Xác nhận nhận hàng”; nhận thiếu thì sửa số từng dòng.</span><Link className="code-link" href="#nhan-hang">Nhận hàng</Link></li>
        : <li><span>{deliveryCreated ? "Đã lập phiếu NCC giao thẳng; khi NCC giao tới công trình, nhân viên bấm “NCC đã giao” kèm ảnh trên phiếu giao." : "NCC giao thẳng tới công trình; xác minh khi hàng tới."}</span></li>}
    </ul>
    {can.create && <div className="inline-actions"><ButtonLink href={`/admin/purchase-orders/new?supplier=${supplierId}`} variant="secondary">Tạo đơn mua mới cùng NCC</ButtonLink></div>}
  </section>;
}
