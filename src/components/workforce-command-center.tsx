"use client";

import {
  AlertOctagon,
  CheckCheck,
  ClockAlert,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  runSupervisorWorkAction,
  type SupervisorWorkActionState,
} from "@/app/app/workforce/actions";
import type {
  WorkforceSnapshot,
  WorkCommandKind,
  WorkItemCard,
} from "@/modules/workforce/types";

const statusLabel: Record<WorkItemCard["status"], string> = {
  AVAILABLE: "Sẵn sàng",
  CLAIMED: "Đã nhận",
  IN_PROGRESS: "Đang làm",
  BLOCKED: "Bị vướng",
  DONE: "Chờ xác minh",
  VERIFIED: "Đã xác minh",
  CLAIM_EXPIRED: "Hết lượt nhận",
  HEARTBEAT_MISSED: "Trễ phản hồi",
  UNRESPONSIVE: "Không phản hồi",
  CANCELLED: "Đã hủy",
};

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="primary-button workforce-submit" disabled={pending}>{pending ? "Đang lưu…" : children}</button>;
}

function SupervisorForm({
  kind,
  workItemId,
  idempotencyKey,
  children,
  label,
}: {
  kind: WorkCommandKind;
  workItemId?: string;
  idempotencyKey: string;
  children?: ReactNode;
  label: string;
}) {
  const initial: SupervisorWorkActionState = { status: "idle", message: "", idempotencyKey };
  const [state, action] = useActionState(runSupervisorWorkAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<FormData | null>(null);
  useEffect(() => {
    if (state.status !== "error" || !formRef.current || !draftRef.current) return;
    for (const [name, value] of draftRef.current.entries()) {
      const control = formRef.current.elements.namedItem(name);
      if (typeof value === "string" && control instanceof HTMLElement && "value" in control) {
        (control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value = value;
      }
    }
  }, [state]);
  return (
    <form action={action} className="workforce-form" onSubmit={(event) => { draftRef.current = new FormData(event.currentTarget); }} ref={formRef}>
      <input name="kind" type="hidden" value={kind} />
      {workItemId ? <input name="workItemId" type="hidden" value={workItemId} /> : null}
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <Submit>{label}</Submit>
      {state.message ? <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"}>{state.message}</p> : null}
    </form>
  );
}

function format(value: string | null) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function QueueItem({ item, data, initialKeys }: { item: WorkItemCard; data: WorkforceSnapshot; initialKeys: Record<string, string> }) {
  const verify = item.status === "DONE";
  return (
    <article className="workforce-queue-item">
      <header>
        <div><span>{item.workNumber}</span><h3>{item.title}</h3></div>
        <span className={`workforce-status status-${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span>
      </header>
      <dl>
        <div><dt>Người đang giữ việc</dt><dd>{item.workerName ?? "Chưa có"}</dd></div>
        <div><dt>Hạn công việc</dt><dd>{format(item.dueAt)}</dd></div>
        <div><dt>Phản hồi gần nhất</dt><dd>{format(item.lastHeartbeatAt)}</dd></div>
      </dl>
      {item.blockedReason ? <p className="workforce-reason"><AlertOctagon />{item.blockedReason}</p> : null}
      {item.externalEffectStarted ? <p className="workforce-external-warning">Đã có tác động thực tế. Không tự động trả việc về bể.</p> : null}
      {verify ? (
        <SupervisorForm kind="work.verify" workItemId={item.id} idempotencyKey={initialKeys[`verify:${item.id}`] ?? `verify-${item.id}`} label="XÁC MINH KẾT QUẢ">
          <label><span>Ghi chú xác minh</span><textarea name="reason" placeholder="Nêu bằng chứng đã đối chiếu và kết quả" required /></label>
        </SupervisorForm>
      ) : (
        <SupervisorForm kind="work.supervise" workItemId={item.id} idempotencyKey={initialKeys[`supervise:${item.id}`] ?? `supervise-${item.id}`} label="LƯU QUYẾT ĐỊNH">
          <div className="workforce-form-grid">
            <label><span>Quyết định</span><select name="supervisorAction" defaultValue="KEEP_ASSIGNMENT">
              <option value="KEEP_ASSIGNMENT">Giữ người đang làm</option>
              <option value="REASSIGN">Giao lại có kiểm soát</option>
              <option value="RECALL">Thu hồi về bể (chưa có tác động thực tế)</option>
              <option value="CANCEL">Hủy công việc</option>
            </select></label>
            <label><span>Người nhận mới (khi giao lại)</span><select name="reassignUserId" defaultValue=""><option value="">Chưa chọn</option>{data.workers.map((worker) => <option key={worker.userId} value={worker.userId}>{worker.displayName} · {worker.employeeCode}</option>)}</select></label>
          </div>
          <label><span>Lý do quyết định</span><textarea name="reason" placeholder="Ít nhất 10 ký tự để lưu dấu vết" required /></label>
        </SupervisorForm>
      )}
    </article>
  );
}

export function WorkforceCommandCenter({ data, initialKeys }: { data: WorkforceSnapshot; initialKeys: Record<string, string> }) {
  const counts = {
    progress: data.assigned.filter((item) => item.status === "IN_PROGRESS").length,
    blocked: data.attention.filter((item) => item.status === "BLOCKED").length,
    unresponsive: data.attention.filter((item) => ["HEARTBEAT_MISSED", "UNRESPONSIVE"].includes(item.status)).length,
    verify: data.attention.filter((item) => item.status === "DONE").length,
  };
  return (
    <div className="workforce-workspace">
      <header className="workforce-page-header">
        <div><p className="page-context">Employee OS · P10</p><h1>Điều hành công việc</h1><p>Một hàng đợi chung để thấy ai đang làm gì, việc nào bị vướng và quyết định nào cần xử lý ngay.</p></div>
        <SupervisorForm kind="work.sweep" idempotencyKey={initialKeys.sweep ?? "sweep-work-items"} label="RÀ SOÁT QUÁ HẠN"><RefreshCw aria-hidden="true" /></SupervisorForm>
      </header>
      <section className="workforce-kpis" aria-label="Tình trạng công việc">
        <article><ListChecks /><span>Đang thực hiện</span><strong>{counts.progress}</strong></article>
        <article><AlertOctagon /><span>Đang bị vướng</span><strong>{counts.blocked}</strong></article>
        <article><ClockAlert /><span>Chậm phản hồi</span><strong>{counts.unresponsive}</strong></article>
        <article><ShieldCheck /><span>Chờ xác minh</span><strong>{counts.verify}</strong></article>
      </section>
      {data.notifications.length ? <section className="workforce-notifications" aria-labelledby="work-notification-heading"><div><ClockAlert /><h2 id="work-notification-heading">Cần xử lý</h2></div>{data.notifications.map((notification) => <article key={notification.id}><strong>{notification.title}</strong><p>{notification.message}</p><span>{notification.workNumber}</span></article>)}</section> : null}
      <section className="workforce-panel" aria-labelledby="supervisor-queue-heading">
        <div className="workforce-section-heading"><div><p className="page-context">Supervisor queue</p><h2 id="supervisor-queue-heading">Hàng đợi giám sát</h2></div><span>{data.attention.length} việc cần quyết định</span></div>
        <div className="workforce-queue">{data.attention.map((item) => <QueueItem data={data} initialKeys={initialKeys} item={item} key={item.id} />)}</div>
        {!data.attention.length ? <p className="workforce-empty"><CheckCheck />Không có việc nào cần giám sát xử lý.</p> : null}
      </section>
      <section className="workforce-panel" aria-labelledby="active-work-heading">
        <div className="workforce-section-heading"><div><p className="page-context">Khối lượng đang hoạt động</p><h2 id="active-work-heading">Công việc và người phụ trách</h2></div><span>{data.assigned.length} việc</span></div>
        <div className="workforce-active-list">{data.assigned.map((item) => <article key={item.id}><UserRoundCheck /><div><strong>{item.title}</strong><span>{item.workerName ?? "Chưa phân công"} · {statusLabel[item.status]}</span></div><time>{format(item.dueAt)}</time></article>)}</div>
      </section>
      <section className="workforce-panel workforce-roles" aria-labelledby="worker-roster-heading">
        <div className="workforce-section-heading"><div><p className="page-context">Vai trò vận hành</p><h2 id="worker-roster-heading">Người có thể nhận việc</h2></div><UsersRound /></div>
        <div>{data.workers.map((worker) => <article key={worker.userId}><strong>{worker.displayName}</strong><span>{worker.employeeCode} · {worker.roles.join(", ")}</span></article>)}</div>
      </section>
    </div>
  );
}
