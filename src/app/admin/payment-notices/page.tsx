import { randomUUID } from "node:crypto";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatBusinessDate } from "@/lib/core/business-time";
import { parseCoreListQuery, CORE_LIST_PAGE_SIZE } from "@/lib/core-list";
import { ListPager } from "@/components/ui/list-pager";
import { NoticeForm } from "@/modules/finance/notice-forms";

export default async function PaymentNoticesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
 const access = await requireInternalPermission("finance.payment_notice.review"), db = await createServerSupabase(), list = parseCoreListQuery(await searchParams), reconcile = access.permissions.has("finance.reconcile");
 const [notices, sources, matches, reversals] = await Promise.all([
  db.from("payment_notice_read").select("id,branch_id,customer_id,customer_name,evidence_id,declared_amount_vnd::text,paid_on,payment_reference,customer_note,review_state,version,submitted_at,review_note,matched_amount_vnd::text,remaining_match_vnd::text,money_match_state").eq("branch_id", access.branchId).order("submitted_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
  reconcile ? db.from("payment_notice_reconciliation_source_read").select("id, customer_id, payment_number, statement_reference, matching_available_vnd::text").eq("branch_id", access.branchId).gt("matching_available_vnd", 0).order("statement_effective_at", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
  db.from("payment_notice_matches").select("id, notice_id, payment_id, reconciliation_match_id, matched_amount_vnd::text, matched_at, matched_by, match_reason").eq("branch_id", access.branchId).order("matched_at", { ascending: false }).limit(300),
  db.from("payment_notice_match_reversals").select("id, match_id, reason").eq("branch_id", access.branchId).limit(300),
 ]);
 if (notices.error || sources.error || matches.error || reversals.error) throw new Error("Không thể tải nguồn đối chiếu thông báo.");
 const undone = new Map((reversals.data ?? []).map(r => [r.match_id, r]));
 const states: Record<string, string> = { SUBMITTED: "Mới thông báo", UNDER_REVIEW: "Đang rà soát ảnh", ACCEPTED: "Đã tiếp nhận chứng từ", REJECTED: "Chứng từ bị từ chối", UNMATCHED: "Chưa nối tiền thực", PARTIAL: "Đã nối một phần tiền", MATCHED: "Đã nối đủ tiền thực", SOURCE_REVERSED: "Nguồn phiếu thu đã đảo, cần sửa đối chiếu" };
 return <><header className="page-heading"><div><p className="eyebrow">Thông báo · tiền thực · công nợ</p><h1>Báo chuyển tiền và đối chiếu</h1><p className="lede">Tiếp nhận ảnh không tạo tiền hoặc giảm nợ. Nối với phiếu thu đã đối chiếu ngân hàng; phân bổ công nợ nằm tại phiếu thu và phải thu.</p></div></header>
  {(notices.data ?? []).slice(0, CORE_LIST_PAGE_SIZE).map(n => {
   const scope = `${access.authUserId}:${access.branchId}:notice:${n.id}`, options = (sources.data ?? []).filter(s => s.customer_id === n.customer_id).map(s => ({ id: s.id, label: `${s.payment_number} · ${s.statement_reference} · còn ${formatVnd(vnd(s.matching_available_vnd))}` }));
   return <section className="card card-pad" key={n.id}><h2>{n.customer_name}</h2><p>{formatVnd(vnd(n.declared_amount_vnd))} · ngày chuyển {formatBusinessDate(n.paid_on)} · {n.payment_reference || "Không có tham chiếu"}</p><p>{states[n.review_state]} · {states[n.money_match_state]}. Đã nối {formatVnd(vnd(n.matched_amount_vnd))}; còn {formatVnd(vnd(n.remaining_match_vnd))}.</p><a className="code-link" href={`/api/evidence/${n.evidence_id}/download`} target="_blank" rel="noreferrer">Mở chứng từ thông báo</a><div className="two-column"><details className="card card-pad"><summary>Rà soát chứng từ</summary><NoticeForm kind="REVIEW" noticeId={n.id} version={n.version} operationId={randomUUID()} scope={`${scope}:review`} /></details>{reconcile && <details className="card card-pad"><summary>Nối tiền đã xác minh</summary><NoticeForm kind="MATCH" noticeId={n.id} version={n.version} operationId={randomUUID()} scope={`${scope}:match`} sources={options} canSubmit={n.review_state === "ACCEPTED" && BigInt(n.remaining_match_vnd) > 0n && options.length > 0} />{!options.length && <p className="muted">Chưa có phần phiếu thu cùng khách còn khả dụng đã đối chiếu ngân hàng. Ghi phiếu thu thực và đối chiếu tại Sổ tiền trước khi nối thông báo.</p>}</details>}</div>
   {(matches.data ?? []).filter(m => m.notice_id === n.id).map(m => <div className="card card-pad" key={m.id}><p>Phiếu thu {m.payment_id} · nguồn ngân hàng {m.reconciliation_match_id} · {formatVnd(vnd(String(m.matched_amount_vnd)))} · người {m.matched_by}.</p><p>{m.match_reason}{undone.has(m.id) && ` · đã sửa liên kết: ${undone.get(m.id)?.reason}`}</p>{reconcile && <details><summary>Sửa liên kết này</summary><NoticeForm kind="REVERSE_MATCH" noticeId={n.id} version={n.version} matchId={m.id} operationId={randomUUID()} scope={`${scope}:reverse:${m.id}`} canSubmit={!undone.has(m.id)} /></details>}</div>)}</section>;
  })}
  <ListPager page={list.page} hasNext={(notices.data ?? []).length > CORE_LIST_PAGE_SIZE} params={{}} />
 </>;
}
