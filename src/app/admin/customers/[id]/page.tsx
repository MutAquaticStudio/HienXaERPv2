import { StatusBadge } from "@/components/ui/status-badge";
import { demoFlow, formatFixtureVnd } from "@/modules/demo/fixtures";
import { requireInternalPermission } from "@/lib/access/context";

export default async function CustomerDetailPage({ params }: PageProps<"/admin/customers/[id]">) {
  await requireInternalPermission("customers.read");
  const { id } = await params;
  return <><header className="page-heading"><div><p className="eyebrow">Khách hàng · MOCK</p><h1>{demoFlow.customer.name}</h1><p className="lede">{id} · {demoFlow.customer.phone} · {demoFlow.customer.address}</p></div><StatusBadge tone="success">Đang hoạt động</StatusBadge></header><div className="three-column"><section className="card card-pad"><span className="metric-label">Hạn mức</span><strong className="metric-value">{formatFixtureVnd(demoFlow.customer.creditLimitVnd)}</strong></section><section className="card card-pad"><span className="metric-label">Phải thu</span><strong className="metric-value">{formatFixtureVnd(demoFlow.debt.outstandingVnd)}</strong></section><section className="card card-pad"><span className="metric-label">Đơn gần nhất</span><strong className="metric-value" style={{ fontSize: 20 }}>{demoFlow.salesOrder.id}</strong></section></div></>;
}
