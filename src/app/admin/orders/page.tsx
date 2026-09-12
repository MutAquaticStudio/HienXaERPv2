import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFixtureVnd, recentOrders } from "@/modules/demo/fixtures";
import Link from "next/link";
import { requireInternalPermission } from "@/lib/access/context";

export default async function OrdersPage() {
  await requireInternalPermission("orders.read");
  return (
    <>
      <header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Đơn bán</h1><p className="lede">Theo dõi từ lúc chốt đơn đến khi hoàn tất giao hàng và ghi nhận công nợ.</p></div><ButtonLink href="/admin/orders/new">Tạo đơn bán</ButtonLink></header>
      <section className="card"><div className="section-head"><h2>3 đơn gần nhất</h2><StatusBadge tone="info">Dữ liệu MOCK</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã đơn</th><th>Tạo lúc</th><th>Khách hàng</th><th>Hàng hóa</th><th>Khối lượng</th><th>Giá trị</th><th>Trạng thái</th></tr></thead><tbody>
        {recentOrders.map((order) => <tr key={order.id}><td><Link className="mono" href={`/admin/orders/${order.id}`}>{order.id}</Link></td><td>{order.createdAt}</td><td className="mono">{order.customerId}</td><td>{order.product}</td><td>{order.quantityTon} tấn</td><td className="mono">{formatFixtureVnd(order.totalVnd)}</td><td><StatusBadge tone={order.status === "Hoàn tất" ? "success" : order.status === "Đang giao" ? "info" : "warning"}>{order.status}</StatusBadge></td></tr>)}
      </tbody></table></div></section>
    </>
  );
}
