import { StatusBadge } from "@/components/ui/status-badge";
import { demoFlow, formatFixtureVnd } from "@/modules/demo/fixtures";

export default function PurchaseOrdersPage() {
  const purchase = demoFlow.purchaseOrder;
  return <><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>Đơn mua</h1><p className="lede">Gom nguồn theo nhu cầu đã chốt, giữ liên kết ngược về đơn bán.</p></div></header><section className="card"><div className="section-head"><h2>Nguồn hàng đang theo dõi</h2><StatusBadge tone="info">MOCK</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã đơn mua</th><th>Đơn bán</th><th>Nhà cung cấp</th><th>Giá trị</th><th>Trạng thái</th></tr></thead><tbody><tr><td className="mono">{purchase.id}</td><td className="mono">{purchase.salesOrderId}</td><td>{purchase.supplier}</td><td className="mono">{formatFixtureVnd(purchase.totalVnd)}</td><td><StatusBadge tone="success">{purchase.status}</StatusBadge></td></tr></tbody></table></div></section></>;
}
