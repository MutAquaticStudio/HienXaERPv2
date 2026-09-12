import { StatusBadge } from "@/components/ui/status-badge";
import { demoFlow, formatFixtureVnd } from "@/modules/demo/fixtures";

export default function DebtsPage() {
  const debt = demoFlow.debt;
  return <><header className="page-heading"><div><p className="eyebrow">Tài chính</p><h1>Công nợ phải thu</h1><p className="lede">Số dư gắn trực tiếp với khách hàng và chứng từ bán hàng.</p></div></header><section className="card"><div className="section-head"><h2>Các khoản đang mở</h2><StatusBadge tone="info">MOCK</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã công nợ</th><th>Khách hàng</th><th>Đơn bán</th><th>Số dư</th><th>Hạn thanh toán</th><th>Trạng thái</th></tr></thead><tbody><tr><td className="mono">{debt.id}</td><td>{demoFlow.customer.name}</td><td className="mono">{debt.salesOrderId}</td><td className="mono">{formatFixtureVnd(debt.outstandingVnd)}</td><td>{debt.dueDate}</td><td><StatusBadge tone="success">{debt.status}</StatusBadge></td></tr></tbody></table></div></section></>;
}
