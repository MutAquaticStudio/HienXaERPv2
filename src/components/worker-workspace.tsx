"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldAlert,
  Signal,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import {
  runWorkerWorkAction,
  type WorkerWorkActionState,
} from "@/app/work/actions";
import type { WorkforceSnapshot, WorkCommandKind, WorkItemCard } from "@/modules/workforce/types";

const statusLabels: Record<WorkItemCard["status"], string> = {
  AVAILABLE: "Có thể nhận",
  CLAIMED: "Đã nhận · chờ bắt đầu",
  IN_PROGRESS: "Đang làm",
  BLOCKED: "Đang bị vướng",
  DONE: "Chờ xác minh",
  VERIFIED: "Đã xác minh",
  CLAIM_EXPIRED: "Lượt nhận đã hết hạn",
  HEARTBEAT_MISSED: "Cần báo tiến độ",
  UNRESPONSIVE: "Chờ giám sát xử lý",
  CANCELLED: "Đã hủy",
};

function Submit({ label, tone = "primary" }: { label: string; tone?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <button className={tone === "primary" ? "primary-button worker-work-button" : "secondary-button worker-work-button"} disabled={pending}>
      {pending ? "ĐANG GỬI…" : label}
    </button>
  );
}

function ActionForm({
  kind,
  workItemId,
  idempotencyKey,
  label,
  tone,
  children,
}: {
  kind: WorkCommandKind;
  workItemId: string;
  idempotencyKey: string;
  label: string;
  tone?: "primary" | "secondary";
  children?: ReactNode;
}) {
  const initial: WorkerWorkActionState = { status: "idle", message: "", idempotencyKey };
  const [state, action] = useActionState(runWorkerWorkAction, initial);
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
    <form action={action} className="worker-work-form" onSubmit={(event) => { draftRef.current = new FormData(event.currentTarget); }} ref={formRef}>
      <input name="kind" type="hidden" value={kind} />
      <input name="workItemId" type="hidden" value={workItemId} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <Submit label={label} tone={tone} />
      {state.message ? (
        <p aria-live="polite" className={state.status === "error" ? "form-error compact" : "form-success"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function formatTime(value: string | null) {
  if (!value) return "Chưa ấn định";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function WorkCard({ item, pool, initialKeys }: { item: WorkItemCard; pool: boolean; initialKeys: Record<string, string> }) {
  return (
    <article className={`work-item-card work-status-${item.status.toLowerCase()}`}>
      <header>
        <div>
          <span className="work-number">{item.workNumber}</span>
          <h2>{item.title}</h2>
        </div>
        <span className="work-status">{statusLabels[item.status]}</span>
      </header>
      {item.description ? <p>{item.description}</p> : null}
      <dl className="work-facts">
        <div><dt><Clock3 aria-hidden="true" />Cần xong trước</dt><dd>{formatTime(item.dueAt)}</dd></div>
        {item.customerName ? <div><dt><PackageCheck aria-hidden="true" />Khách hàng</dt><dd>{item.customerName}</dd></div> : null}
        {item.pickupAddress ? <div><dt><MapPin aria-hidden="true" />Lộ trình</dt><dd>{item.pickupAddress} → {item.dropAddress}</dd></div> : null}
      </dl>
      {item.status === "CLAIMED" && item.claimExpiresAt ? (
        <p className="work-warning"><AlertTriangle aria-hidden="true" />Bắt đầu trước {formatTime(item.claimExpiresAt)}, nếu không lượt nhận sẽ hết hạn.</p>
      ) : null}
      {item.status === "UNRESPONSIVE" ? (
        <p className="work-warning"><ShieldAlert aria-hidden="true" />Bạn tạm thời không thể nhận việc mới cho đến khi giám sát xử lý.</p>
      ) : null}
      {pool ? (
        <ActionForm kind="work.claim" workItemId={item.id} idempotencyKey={initialKeys[`claim:${item.id}`] ?? `claim-${item.id}`} label="NHẬN VIỆC NÀY" />
      ) : null}
      {item.status === "CLAIMED" ? (
        <ActionForm kind="work.start" workItemId={item.id} idempotencyKey={initialKeys[`start:${item.id}`] ?? `start-${item.id}`} label="BẮT ĐẦU CÔNG VIỆC">
          <span className="work-action-explainer"><Play aria-hidden="true" />Bấm khi bạn đã sẵn sàng thực hiện.</span>
        </ActionForm>
      ) : null}
      {["IN_PROGRESS", "HEARTBEAT_MISSED"].includes(item.status) ? (
        <div className="work-actions">
          <ActionForm kind="work.heartbeat" workItemId={item.id} idempotencyKey={initialKeys[`heartbeat:${item.id}`] ?? `heartbeat-${item.id}`} label="BÁO TIẾN ĐỘ">
            <label><span>Ghi chú tiến độ (không bắt buộc)</span><input name="progressNote" placeholder="Ví dụ: Đã đến điểm lấy hàng" /></label>
          </ActionForm>
          <ActionForm kind="work.complete" workItemId={item.id} idempotencyKey={initialKeys[`complete:${item.id}`] ?? `complete-${item.id}`} label="BÁO HOÀN THÀNH" />
          <details className="worker-block-details">
            <summary>Báo công việc đang bị vướng</summary>
            <ActionForm kind="work.block" workItemId={item.id} idempotencyKey={initialKeys[`block:${item.id}`] ?? `block-${item.id}`} label="GỬI CHO GIÁM SÁT" tone="secondary">
              <label><span>Lý do bị vướng</span><textarea name="reason" placeholder="Nêu rõ sự cố, vị trí và hỗ trợ cần thiết" required /></label>
            </ActionForm>
          </details>
        </div>
      ) : null}
      {item.status === "BLOCKED" && item.blockedReason ? <p className="work-warning"><AlertTriangle />{item.blockedReason}</p> : null}
      {item.status === "DONE" ? <p className="work-success"><CheckCircle2 />Đã ghi nhận kết quả, đang chờ giám sát xác minh.</p> : null}
    </article>
  );
}

export function WorkerWorkspace({
  data,
  initialKeys,
  mode,
}: {
  data: WorkforceSnapshot;
  initialKeys: Record<string, string>;
  mode: "assigned" | "pool";
}) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const refresh = () => setOnline(window.navigator.onLine);
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);
  const items = mode === "pool" ? data.pool : data.assigned;
  return (
    <section className="worker-workspace" aria-labelledby="worker-work-heading">
      <header className="worker-work-heading">
        <div>
          <p className="page-context">{mode === "pool" ? "Việc phù hợp với vai trò" : "Ưu tiên hôm nay"}</p>
          <h1 id="worker-work-heading">{mode === "pool" ? "Bể công việc" : "Việc của tôi"}</h1>
          <p>{mode === "pool" ? "Chỉ hiển thị việc bạn đủ vai trò, kỹ năng và còn giới hạn để nhận." : "Bắt đầu, báo tiến độ và báo vướng ngay trên từng công việc."}</p>
        </div>
        <span className={online ? "connectivity-online" : "connectivity-offline"} role="status">
          <Signal aria-hidden="true" />{online ? "Đang kết nối" : "Mất kết nối — chưa gửi thao tác"}
        </span>
      </header>
      {data.notifications[0] && mode === "assigned" ? (
        <aside className="worker-notification" aria-label="Thông báo cần chú ý">
          <AlertTriangle aria-hidden="true" />
          <div><strong>{data.notifications[0].title}</strong><p>{data.notifications[0].message}</p></div>
        </aside>
      ) : null}
      <div className="worker-work-list">
        {items.map((item) => <WorkCard item={item} pool={mode === "pool"} initialKeys={initialKeys} key={item.id} />)}
      </div>
      {!items.length ? (
        <div className="empty-work-card"><CheckCircle2 size={66} /><h2>{mode === "pool" ? "Chưa có việc phù hợp" : "Không có việc đang làm"}</h2><p>Hệ thống sẽ cập nhật ngay khi có công việc mới hoặc khi giới hạn của bạn cho phép.</p></div>
      ) : null}
      <button className="secondary-button worker-cta" onClick={() => window.location.reload()} type="button"><RefreshCw />TẢI LẠI</button>
    </section>
  );
}
