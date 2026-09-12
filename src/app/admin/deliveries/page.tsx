import { StatusBadge } from "@/components/ui/status-badge";
import { demoFlow } from "@/modules/demo/fixtures";
import { requireInternalPermission } from "@/lib/access/context";

export default async function DeliveriesPage() {
  await requireInternalPermission("delivery.read");
  const delivery = demoFlow.delivery;
  return <><header className="page-heading"><div><p className="eyebrow">Điều phối</p><h1>Giao hàng</h1><p className="lede">Theo dõi xe, tài xế và trạng thái xuất kho theo từng đơn.</p></div></header><section className="card"><div className="section-head"><h2>Chuyến hôm nay</h2><StatusBadge tone="info">MOCK</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã chuyến</th><th>Đơn bán</th><th>Đơn mua</th><th>Xe</th><th>Tài xế</th><th>Trạng thái</th></tr></thead><tbody><tr><td className="mono">{delivery.id}</td><td className="mono">{delivery.salesOrderId}</td><td className="mono">{delivery.purchaseOrderId}</td><td>{delivery.vehicle}</td><td>{delivery.driver}</td><td><StatusBadge tone="warning">{delivery.status}</StatusBadge></td></tr></tbody></table></div></section></>;
}
