import { formatBusinessDate } from "@/lib/core/business-time";
import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireCustomerAccess } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { salesStateLabel, salesStateTone } from "@/modules/portal/presentation";

type Quote = { id: string; quotation_number: string; revision_number: number; state: string; total_vnd: string; site_name_snapshot: string; expires_at: string | null };
export default async function CustomerQuotationsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const membership = await requireCustomerAccess();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("quotation_read").select("id, quotation_number, revision_number, state, total_vnd::text, site_name_snapshot, expires_at").eq("customer_id", membership.customerId).order("created_at", { ascending: false });
  if (error) throw new Error("Không thể tải báo giá của khách hàng.");
  const rows = data as Quote[];
  const query = await searchParams;
  return <><header className="page-heading"><div><p className="eyebrow">Cổng khách hàng</p><h1>Báo giá của tôi</h1><p className="lede">Mở đúng phiên bản trước khi chấp nhận. Hệ thống không coi thao tác này là xác nhận đơn bán.</p></div></header><ActionNotice notice={query.notice} error={query.error} /><section className="card"><div className="table-wrap"><table><thead><tr><th>Số báo giá</th><th>Phiên bản</th><th>Công trình</th><th>Giá trị</th><th>Trạng thái</th><th>Hiệu lực</th></tr></thead><tbody>{rows.map((quote) => <tr key={quote.id}><td><Link className="mono code-link" href={`/customer/quotations/${quote.id}`}>{quote.quotation_number}</Link></td><td>R{quote.revision_number}</td><td>{quote.site_name_snapshot}</td><td className="mono">{formatVnd(vnd(quote.total_vnd))}</td><td><StatusBadge tone={salesStateTone(quote.state)}>{salesStateLabel(quote.state)}</StatusBadge></td><td>{quote.expires_at ? formatBusinessDate(quote.expires_at) : "Không giới hạn"}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có báo giá.</p>}</div></section></>;
}
