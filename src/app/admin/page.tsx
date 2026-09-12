import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoFlow, formatFixtureVnd, recentOrders } from "@/modules/demo/fixtures";
import Link from "next/link";

export default function AdminDashboard() {
  return (
    <>
      <div className="mock-banner">MOCK · Luồng dữ liệu minh họa, chưa kết nối dữ liệu Production.</div>
      <header className="page-heading">
        <div><p className="eyebrow">Tổng quan vận hành</p><h1>Buổi sáng cần xử lý gì?</h1><p className="lede">Một màn hình ưu tiên đơn hàng, nguồn cung, giao nhận và tiền phải thu.</p></div>
        <ButtonLink href="/admin/orders/new">Tạo đơn bán</ButtonLink>
      </header>
      <section className="metric-grid" aria-label="Chỉ số chính">
        <article className="card metric-card"><span className="metric-label">Đơn chờ xử lý</span><strong className="metric-value">08</strong><span className="metric-note">3 đơn mới sáng nay</span></article>
        <article className="card metric-card"><span className="metric-label">Cần gom nguồn</span><strong className="metric-value">04</strong><span className="metric-note">1 đơn cần ưu tiên</span></article>
        <article className="card metric-card"><span className="metric-label">Chuyến giao hôm nay</span><strong className="metric-value">06</strong><span className="metric-note">2 chuyến đã hoàn tất</span></article>
        <article className="card metric-card"><span className="metric-label">Phải thu</span><strong className="metric-value">126,4 tr</strong><span className="metric-note">84% còn trong hạn</span></article>
      </section>
      <div className="two-column">
        <section className="card">
          <div className="section-head"><h2>Đơn gần đây</h2><ButtonLink href="/admin/orders" variant="secondary">Xem tất cả</ButtonLink></div>
          <div className="table-wrap"><table><thead><tr><th>Mã đơn</th><th>Hàng hóa</th><th>Giá trị</th><th>Trạng thái</th></tr></thead><tbody>
            {recentOrders.map((order) => <tr key={order.id}><td><Link className="mono" href={`/admin/orders/${order.id}`}>{order.id}</Link></td><td>{order.product}</td><td className="mono">{formatFixtureVnd(order.totalVnd)}</td><td><StatusBadge tone={order.status === "Hoàn tất" ? "success" : order.status === "Đang giao" ? "info" : "warning"}>{order.status}</StatusBadge></td></tr>)}
          </tbody></table></div>
        </section>
        <section className="card card-pad"><h2>Luồng cần theo dõi</h2><ol className="timeline"><li><strong>{demoFlow.salesOrder.id}</strong><small>Đơn bán · {demoFlow.salesOrder.status}</small></li><li><strong>{demoFlow.purchaseOrder.id}</strong><small>Nguồn hàng · {demoFlow.purchaseOrder.status}</small></li><li><strong>{demoFlow.delivery.id}</strong><small>Giao hàng · {demoFlow.delivery.status}</small></li><li><strong>{demoFlow.debt.id}</strong><small>Công nợ · {formatFixtureVnd(demoFlow.debt.outstandingVnd)}</small></li></ol></section>
      </div>
    </>
  );
}
