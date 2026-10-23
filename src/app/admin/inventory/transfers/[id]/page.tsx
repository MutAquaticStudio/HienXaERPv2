import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { StatusBadge } from "@/components/ui/status-badge";
import { TransferEventForm } from "@/modules/inventory/transfer-forms";
import { quickTransferStepAction } from "@/modules/inventory/transfer-actions";
import { transferEventLabel, transferStatus } from "@/modules/inventory/transfer-presentation";

const Exact = Decimal.clone({ precision: 50 });
const NOTICE: Record<string, string> = { shipped: "Đã xuất kho.", received: "Đã nhận đủ hàng vào kho." };

/** FB10 (5.2): transfer detail like KiotViet — info, one line table (plan · shipped · received · short), one-tap next step. */
export default async function WarehouseTransferDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
 const access = await requireInternalPermission("inventory.read"), { id } = await params, query = await searchParams; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 const db = await createServerSupabase(); const [source, history] = await Promise.all([
  db.from("warehouse_transfer_read").select("id,branch_id,transfer_number,from_warehouse_id,to_warehouse_id,material_id,base_uom_id,planned_base_quantity,dispatch_closed,version,reason,created_by,created_at,from_warehouse_name,to_warehouse_name,material_code,material_name,shipped_base_quantity,received_base_quantity,loss_base_quantity,in_transit_base_quantity,transfer_state,in_transit_value_vnd::text").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
  db.from("warehouse_transfer_event_read").select("id, event_kind, source_dispatch_id, source_issue_id, base_quantity, value_vnd::text, reason, recorded_by, recorded_at").eq("transfer_id", id).order("recorded_at").order("id"),
 ]);
 if (source.error || history.error) throw new Error("Không thể tải phiếu chuyển kho."); if (!source.data) notFound();
 const t = source.data, events = history.data ?? [];
 const [unitResult, peopleResult] = await Promise.all([
  db.from("units_of_measure").select("symbol").eq("id", t.base_uom_id).maybeSingle(),
  db.from("employees").select("auth_user_id, display_name").in("auth_user_id", [...new Set([t.created_by, ...events.map(e => e.recorded_by)])]),
 ]);
 const unit = unitResult.data?.symbol ?? "", people = new Map((peopleResult.data ?? []).map(p => [p.auth_user_id, p.display_name]));
 const qty = (value: string) => `${formatQuantity(value)} ${unit}`.trim();
 const remaining = (e: (typeof events)[number], issue: boolean) => new Exact(e.base_quantity).minus(events.filter(x => (issue ? x.source_issue_id : x.source_dispatch_id) === e.id && ["RECEIVE", "APPROVE_LOSS"].includes(x.event_kind)).reduce((sum, x) => sum.plus(x.base_quantity), new Exact(0)));
 const dispatches = events.filter(e => e.event_kind === "DISPATCH");
 const lots = dispatches.filter(e => remaining(e, false).gt(0)).map(e => ({ id: e.id, label: `Đợt xuất ${dispatches.indexOf(e) + 1} · ${formatBusinessDateTime(e.recorded_at)} · còn ${qty(remaining(e, false).toFixed())}` }));
 const issues = events.filter(e => e.event_kind === "REPORT_SHORTAGE" && remaining(e, true).gt(0)).map((e, index) => ({ id: e.id, label: `Báo thiếu ${index + 1} · còn ${qty(remaining(e, true).toFixed())}` }));
 const status = transferStatus(t);
 const short = new Exact(t.shipped_base_quantity).minus(t.received_base_quantity).minus(t.loss_base_quantity).minus(t.in_transit_base_quantity);
 const can = { ship: access.permissions.has("inventory.reserve"), receive: access.permissions.has("inventory.receive"), adjust: access.permissions.has("inventory.adjust") };
 const kinds: (keyof typeof transferEventLabel)[] = [];
 if (can.ship) kinds.push("DISPATCH", "CLOSE_DISPATCH");
 if (can.receive) kinds.push("RECEIVE", "REPORT_SHORTAGE");
 if (can.adjust) kinds.push("APPROVE_LOSS");
 const canRecord = (kind: keyof typeof transferEventLabel) => kind === "DISPATCH" ? !t.dispatch_closed && new Exact(t.shipped_base_quantity).lt(t.planned_base_quantity) : kind === "CLOSE_DISPATCH" ? !t.dispatch_closed : kind === "APPROVE_LOSS" ? issues.length > 0 : lots.length > 0;
 const oneTap = status.step === "DISPATCH_ALL" && can.ship ? "Xuất kho" : status.step === "RECEIVE_ALL" && can.receive ? "Nhận đủ" : null;
 return <><header className="page-heading"><div><p className="eyebrow"><Link href="/admin/inventory/transfers">Chuyển kho</Link></p><h1>{t.transfer_number}</h1><p className="lede">{t.from_warehouse_name} → {t.to_warehouse_name}</p></div>
   <div className="action-cluster"><StatusBadge tone={status.tone}>{status.label}</StatusBadge>{oneTap && <form action={quickTransferStepAction}><input type="hidden" name="transferId" value={id} /><input type="hidden" name="step" value={status.step!} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary" type="submit">{oneTap}</button></form>}</div></header>
  {query.notice && NOTICE[query.notice] && <p className="form-message success" role="status">{NOTICE[query.notice]}</p>}
  {query.error && <p className="form-message" role="alert">{query.error}</p>}
  <section className="card card-pad"><dl className="detail-grid">
   <div><dt>Từ kho</dt><dd>{t.from_warehouse_name}</dd></div><div><dt>Tới kho</dt><dd>{t.to_warehouse_name}</dd></div>
   <div><dt>Ngày tạo</dt><dd>{formatBusinessDateTime(t.created_at)} · {people.get(t.created_by) ?? "—"}</dd></div><div><dt>Ghi chú</dt><dd>{t.reason}</dd></div>
  </dl></section>
  <section className="card"><div className="table-wrap"><table><thead><tr><th>Hàng hóa</th><th className="numeric">SL chuyển</th><th className="numeric">Đã xuất</th><th className="numeric">Đã nhận</th><th className="numeric">Đang chuyển</th><th className="numeric">Thiếu / hao hụt</th>{t.in_transit_value_vnd !== null && <th className="numeric">Giá trị đang chuyển</th>}</tr></thead>
   <tbody><tr><td><strong>{t.material_name}</strong><small className="table-subline">{t.material_code}</small></td><td className="numeric">{qty(t.planned_base_quantity)}</td><td className="numeric">{qty(t.shipped_base_quantity)}</td><td className="numeric">{qty(t.received_base_quantity)}</td><td className="numeric">{qty(t.in_transit_base_quantity)}</td>
    <td className="numeric">{new Exact(t.loss_base_quantity).gt(0) || short.gt(0) ? qty(new Exact(t.loss_base_quantity).plus(short.gt(0) ? short : 0).toFixed()) : "—"}</td>{t.in_transit_value_vnd !== null && <td className="numeric">{formatVnd(vnd(t.in_transit_value_vnd))}</td>}</tr></tbody></table></div></section>
  {kinds.length > 0 && <details className="card card-pad"><summary>Xuất / nhận từng phần, báo thiếu, duyệt hao hụt</summary><div className="two-column">{kinds.map(kind => <section key={kind}><h3>{transferEventLabel[kind]}</h3><TransferEventForm transferId={id} version={t.version} kind={kind} operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:transfer:${id}:${kind}`} lots={lots} issues={issues} canRecord={canRecord(kind)} /></section>)}</div></details>}
  <section className="card"><div className="section-head"><h2>Lịch sử</h2></div><div className="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người làm</th><th>Thao tác</th><th className="numeric">Số lượng</th>{access.permissions.has("inventory.cost.read") && <th className="numeric">Giá trị</th>}<th>Ghi chú</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td>{formatBusinessDateTime(e.recorded_at)}</td><td>{people.get(e.recorded_by) ?? "—"}</td><td>{transferEventLabel[e.event_kind as keyof typeof transferEventLabel]}</td><td className="numeric">{qty(e.base_quantity)}</td>{access.permissions.has("inventory.cost.read") && <td className="numeric">{e.value_vnd === null ? "—" : formatVnd(vnd(e.value_vnd))}</td>}<td>{e.reason}</td></tr>)}{!events.length && <tr><td colSpan={6} className="muted">Chưa xuất kho.</td></tr>}</tbody></table></div></section>
 </>;
}
