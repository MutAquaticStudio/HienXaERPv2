import { StatusBadge } from "@/components/ui/status-badge";
import { demoFlow, formatFixtureVnd } from "@/modules/demo/fixtures";
import Link from "next/link";
import { requireInternalPermission } from "@/lib/access/context";

export default async function CustomersPage() {
  await requireInternalPermission("customers.read");
  return <><header className="page-heading"><div><p className="eyebrow">Quan hệ khách hàng</p><h1>Khách hàng</h1><p className="lede">Hồ sơ giao dịch và hạn mức công nợ theo từng khách.</p></div></header><section className="card"><div className="section-head"><h2>Khách đang giao dịch</h2><StatusBadge tone="info">MOCK</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Tên khách hàng</th><th>Khu vực</th><th>Hạn mức</th><th>Phải thu</th></tr></thead><tbody><tr><td><Link className="mono" href={`/admin/customers/${demoFlow.customer.id}`}>{demoFlow.customer.id}</Link></td><td>{demoFlow.customer.name}</td><td>{demoFlow.customer.address}</td><td className="mono">{formatFixtureVnd(demoFlow.customer.creditLimitVnd)}</td><td className="mono">{formatFixtureVnd(demoFlow.debt.outstandingVnd)}</td></tr></tbody></table></div></section></>;
}
