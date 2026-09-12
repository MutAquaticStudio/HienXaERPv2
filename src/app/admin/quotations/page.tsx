import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { salesStateLabel, salesStateTone } from "@/modules/sales/presentation";

type Quote = { id: string; quotation_number: string; revision_number: number; state: string; total_vnd: string; customer_name_snapshot: string; site_name_snapshot: string; expires_at: string | null; created_at: string };
export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("quotation.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("quotation_read").select("id, quotation_number, revision_number, state, total_vnd, customer_name_snapshot, site_name_snapshot, expires_at, created_at").eq("branch_id", access.branchId).order("created_at", { ascending: false });
  if (error) throw new Error("Không thể tải báo giá.");
  const rows = data as Quote[];
  const query = await searchParams;
  return <><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Báo giá</h1><p className="lede">Mỗi lần gửi khóa một revision; chấp nhận luôn trỏ đúng revision đã xem.</p></div>{access.permissions.has("quotation.create") && <ButtonLink href="/admin/quotations/new">Tạo báo giá</ButtonLink>}</header><ActionNotice notice={query.notice} error={query.error} /><section className="card"><div className="section-head"><h2>{rows.length} báo giá</h2></div><div className="table-wrap"><table><thead><tr><th>Số báo giá</th><th>Revision</th><th>Khách hàng / công trình</th><th>Giá trị</th><th>Trạng thái</th><th>Hiệu lực đến</th></tr></thead><tbody>{rows.map((quote) => <tr key={quote.id}><td><Link className="mono code-link" href={`/admin/quotations/${quote.id}`}>{quote.quotation_number}</Link></td><td>R{quote.revision_number}</td><td>{quote.customer_name_snapshot}<small className="table-subline">{quote.site_name_snapshot}</small></td><td className="mono">{formatVnd(vnd(quote.total_vnd))}</td><td><StatusBadge tone={salesStateTone(quote.state)}>{salesStateLabel(quote.state)}</StatusBadge></td><td>{quote.expires_at ? new Intl.DateTimeFormat("vi-VN").format(new Date(quote.expires_at)) : "Không giới hạn"}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Chưa có báo giá trong chi nhánh này.</p>}</div></section></>;
}
