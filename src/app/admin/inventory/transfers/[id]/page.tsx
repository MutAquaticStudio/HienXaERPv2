import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { TransferEventForm } from "@/modules/inventory/transfer-forms";
import { transferEventLabel } from "@/modules/inventory/transfer-presentation";

const Exact = Decimal.clone({ precision: 50 });
export default async function WarehouseTransferDetail({ params }: { params: Promise<{ id: string }> }) {
 const access = await requireInternalPermission("inventory.read"), { id } = await params; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 const db = await createServerSupabase(); const [source, history] = await Promise.all([
  db.from("warehouse_transfer_read").select("*").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
  db.from("warehouse_transfer_event_read").select("id, event_kind, source_dispatch_id, source_issue_id, base_quantity, value_vnd, reason, recorded_by, recorded_at").eq("transfer_id", id).order("recorded_at").order("id"),
 ]);
 if (source.error || history.error) throw new Error("Không thể tải hồ sơ chuyển kho."); if (!source.data) notFound();
 const t = source.data, events = history.data ?? [];
 const remaining = (e: (typeof events)[number], issue: boolean) => new Exact(e.base_quantity).minus(events.filter(x => (issue ? x.source_issue_id : x.source_dispatch_id) === e.id && ["RECEIVE", "APPROVE_LOSS"].includes(x.event_kind)).reduce((sum, x) => sum.plus(x.base_quantity), new Exact(0)));
 const lots = events.filter(e => e.event_kind === "DISPATCH" && remaining(e, false).gt(0)).map(e => ({ id: e.id, label: `${e.id} · còn ${remaining(e, false).toFixed()} · ${formatBusinessDateTime(e.recorded_at)}` }));
 const issues = events.filter(e => e.event_kind === "REPORT_SHORTAGE" && remaining(e, true).gt(0)).map(e => ({ id: e.id, label: `${e.id} · còn ${remaining(e, true).toFixed()} · ${e.reason}` }));
 const kinds: (keyof typeof transferEventLabel)[] = [];
 if (access.permissions.has("inventory.reserve")) kinds.push("DISPATCH", "CLOSE_DISPATCH");
 if (access.permissions.has("inventory.receive")) kinds.push("RECEIVE", "REPORT_SHORTAGE");
 if (access.permissions.has("inventory.adjust")) kinds.push("APPROVE_LOSS");
 const canRecord = (kind: keyof typeof transferEventLabel) => kind === "DISPATCH" ? !t.dispatch_closed && new Exact(t.shipped_base_quantity).lt(t.planned_base_quantity) : kind === "CLOSE_DISPATCH" ? !t.dispatch_closed : kind === "APPROVE_LOSS" ? issues.length > 0 : lots.length > 0;
 return <><header className="page-heading"><div><p className="eyebrow">Chuyển kho theo nguồn</p><h1>{t.transfer_number}</h1><p className="lede">{t.from_warehouse_name} → {t.to_warehouse_name} · {t.material_code} / {t.material_name}</p></div><Link className="button button-secondary" href="/admin/inventory/transfers">Phiếu chuyển kho</Link></header>
  <section className="card card-pad"><h2>{t.transfer_state === "CLOSED" ? "Đã xử lý hết" : "Còn phải xử lý"}</h2><p>Kế hoạch {t.planned_base_quantity}; thực xuất {t.shipped_base_quantity}; thực nhận {t.received_base_quantity}; hao hụt đã duyệt {t.loss_base_quantity}; đang chuyển {t.in_transit_base_quantity}.</p>{t.in_transit_value_vnd !== null && <p>Giá trị đang chuyển: {formatVnd(vnd(t.in_transit_value_vnd))}</p>}{issues.length > 0 && <p role="status">Còn {issues.length} hồ sơ thiếu / hỏng. Nhận bổ sung hoặc duyệt hao hụt theo đúng hồ sơ.</p>}<p>{t.reason}</p><p className="muted">Phần chưa xuất được đóng riêng có lý do; kế hoạch ban đầu được giữ. Không tạo hai điều chỉnh kiểm kê.</p></section>
  <div className="two-column">{kinds.map(kind => <details key={kind} className="card card-pad"><summary>{transferEventLabel[kind]}</summary><TransferEventForm transferId={id} version={t.version} kind={kind} operationId={randomUUID()} scope={`${access.authUserId}:${access.branchId}:transfer:${id}:${kind}`} lots={lots} issues={issues} canRecord={canRecord(kind)} /></details>)}</div>
  <section className="card"><div className="section-head"><h2>Lịch sử theo nguồn</h2></div><div className="table-wrap"><table><thead><tr><th>Thời điểm / người</th><th>Thao tác</th><th>Lượng</th>{access.permissions.has("inventory.cost.read") && <th>Giá trị</th>}<th>Nguồn / lý do</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td>{formatBusinessDateTime(e.recorded_at)}<small className="table-subline">{e.recorded_by}</small></td><td>{transferEventLabel[e.event_kind as keyof typeof transferEventLabel]}</td><td>{e.base_quantity}</td>{access.permissions.has("inventory.cost.read") && <td>{e.value_vnd === null ? "Chưa xác minh" : formatVnd(vnd(e.value_vnd))}</td>}<td>{e.reason}<small className="table-subline">{e.id}{e.source_dispatch_id && ` · đợt xuất ${e.source_dispatch_id}`}{e.source_issue_id && ` · hồ sơ ${e.source_issue_id}`}</small></td></tr>)}</tbody></table></div></section>
 </>;
}
