import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoFlow, formatFixtureVnd } from "@/modules/demo/fixtures";

export default async function OrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const order = demoFlow.salesOrder;
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Đơn bán · MOCK</p><h1>{id}</h1><p className="lede">Toàn bộ quan hệ nguồn hàng, giao nhận và công nợ trên một hồ sơ.</p></div><ButtonLink href="/admin/orders" variant="secondary">Về danh sách</ButtonLink></header>
      <div className="two-column">
        <section className="card card-pad"><div className="section-head" style={{ padding: 0, marginBottom: 18 }}><h2>Thông tin đơn</h2><StatusBadge tone="warning">{order.status}</StatusBadge></div><dl className="detail-grid"><div className="detail-item"><dt>Khách hàng</dt><dd>{demoFlow.customer.name}</dd></div><div className="detail-item"><dt>Hàng hóa</dt><dd>{order.product}</dd></div><div className="detail-item"><dt>Khối lượng</dt><dd>{order.quantityTon} tấn</dd></div><div className="detail-item"><dt>Quy đổi</dt><dd>{order.bagCount} bao × {order.bagWeightKg} kg</dd></div><div className="detail-item"><dt>Đơn giá</dt><dd className="mono">{formatFixtureVnd(order.unitPriceVnd)} / tấn</dd></div><div className="detail-item"><dt>Thành tiền</dt><dd className="mono">{formatFixtureVnd(order.totalVnd)}</dd></div></dl></section>
        <section className="card card-pad"><h2>Chuỗi thực hiện</h2><ol className="timeline"><li><strong>{demoFlow.purchaseOrder.id}</strong><small>{demoFlow.purchaseOrder.supplier} · {demoFlow.purchaseOrder.status}</small></li><li><strong>{demoFlow.delivery.id}</strong><small>{demoFlow.delivery.vehicle} · {demoFlow.delivery.status}</small></li><li><strong>{demoFlow.debt.id}</strong><small>Hạn {demoFlow.debt.dueDate} · {demoFlow.debt.status}</small></li></ol></section>
      </div>
    </>
  );
}
