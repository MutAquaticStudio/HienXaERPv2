"use client";

import {
  AlertTriangle,
  Camera,
  Clock3,
  Construction,
  Fuel,
  MapPin,
  Pause,
  Play,
  Square,
  TimerReset,
} from "lucide-react";
import { useActionState, useEffect, useRef, type ReactNode } from "react";

import { runWorkerServiceJobAction } from "@/app/work/service/actions";
import type { ServiceJobActionState } from "@/app/app/service/actions";
import type {
  ServiceJobSnapshot,
  ServiceJobSummary,
  ServiceLogType,
} from "@/modules/service-jobs/types";
import {
  allowedWorkerLogs,
  SERVICE_LOG_LABELS,
  SERVICE_STATUS_LABELS,
} from "@/modules/service-jobs/workflow";

const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const logIcon = {
  START: Play,
  BREAK_START: Pause,
  BREAK_END: TimerReset,
  FUEL: Fuel,
  EVIDENCE: Camera,
  INCIDENT: AlertTriangle,
  END: Square,
} as const;

function WorkerLogForm({
  children,
  description,
  idempotencyKey,
  job,
  label,
  logType,
  tone = "primary",
}: {
  children?: ReactNode;
  description?: string;
  idempotencyKey: string;
  job: ServiceJobSummary;
  label: string;
  logType: ServiceLogType;
  tone?: "primary" | "secondary" | "risk";
}) {
  const [state, action, pending] = useActionState(runWorkerServiceJobAction, {
    status: "idle",
    message: "",
    idempotencyKey,
  } satisfies ServiceJobActionState);
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useRef<Array<[string, string]>>([]);
  useEffect(() => {
    if (state.status !== "error" || !formRef.current) return;
    for (const [name, value] of draft.current) {
      const control = formRef.current.elements.namedItem(name);
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        control.value = value;
      }
    }
  }, [state]);
  const Icon = logIcon[logType];
  return (
    <form
      ref={formRef}
      action={action}
      className="service-worker-form"
      onSubmit={(event) => {
        draft.current = Array.from(
          new FormData(event.currentTarget).entries(),
        ).flatMap(([name, value]) =>
          typeof value === "string"
            ? ([[name, value]] as Array<[string, string]>)
            : [],
        );
      }}
    >
      <input name="kind" type="hidden" value="service.job.log" />
      <input name="serviceJobId" type="hidden" value={job.id} />
      <input name="logType" type="hidden" value={logType} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      {description ? (
        <p className="service-worker-consequence">{description}</p>
      ) : null}
      <button
        aria-busy={pending}
        className={
          tone === "primary"
            ? "primary-button service-worker-button"
            : tone === "risk"
              ? "service-risk-button service-worker-button"
              : "secondary-button service-worker-button"
        }
        disabled={pending}
        type="submit"
      >
        <Icon aria-hidden="true" />
        {pending ? "Đang gửi…" : label}
      </button>
      {state.status !== "idle" ? (
        <p
          aria-atomic="true"
          aria-live="polite"
          className={`form-message form-message-${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function WorkerJobCard({
  data,
  initialKeys,
  job,
}: {
  data: ServiceJobSnapshot;
  initialKeys: Record<string, string>;
  job: ServiceJobSummary;
}) {
  const allowed = allowedWorkerLogs(job.status);
  const logs = data.logs.filter((log) => log.serviceJobId === job.id);
  const keyFor = (type: ServiceLogType) =>
    initialKeys[`${type}:${job.id}`] ?? `service-worker-${type}-${job.id}`;
  return (
    <article className="service-worker-card">
      <header>
        <div>
          <span>{job.jobNumber}</span>
          <h2>{job.serviceTypeName}</h2>
        </div>
        <strong className={`service-status status-${job.status.toLowerCase()}`}>
          {SERVICE_STATUS_LABELS[job.status]}
        </strong>
      </header>
      <div className="service-worker-location">
        <MapPin aria-hidden="true" />
        <div>
          <strong>{job.siteName}</strong>
          <span>{job.siteAddress}</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Khách hàng</dt>
          <dd>{job.customerName}</dd>
        </div>
        <div>
          <dt>Máy</dt>
          <dd>{job.machineName}</dd>
        </div>
        <div>
          <dt>Bắt đầu dự kiến</dt>
          <dd>{dateTime(job.scheduledStartAt)}</dd>
        </div>
        <div>
          <dt>Giờ thực tế</dt>
          <dd>{Number(job.actualHours).toFixed(2)} giờ</dd>
        </div>
      </dl>
      {job.notes ? (
        <p className="service-worker-note">Yêu cầu: {job.notes}</p>
      ) : null}
      {allowed.length ? (
        <section
          className="service-worker-actions"
          aria-label={`Thao tác cho ${job.jobNumber}`}
        >
          {allowed.includes("START") ? (
            <WorkerLogForm
              description="Bắt đầu sẽ ghi thời điểm thực tế và chuyển WorkItem sang đang thực hiện."
              idempotencyKey={keyFor("START")}
              job={job}
              label="BẮT ĐẦU CÔNG VIỆC"
              logType="START"
            >
              <label>
                Ghi chú kiểm tra đầu ca
                <input name="note" placeholder="Không bắt buộc" />
              </label>
            </WorkerLogForm>
          ) : null}
          {allowed.includes("BREAK_START") ? (
            <WorkerLogForm
              idempotencyKey={keyFor("BREAK_START")}
              job={job}
              label="BẮT ĐẦU NGHỈ"
              logType="BREAK_START"
              tone="secondary"
            />
          ) : null}
          {allowed.includes("BREAK_END") ? (
            <WorkerLogForm
              idempotencyKey={keyFor("BREAK_END")}
              job={job}
              label="TIẾP TỤC LÀM"
              logType="BREAK_END"
            />
          ) : null}
          {allowed.includes("FUEL") ? (
            <WorkerLogForm
              idempotencyKey={keyFor("FUEL")}
              job={job}
              label="GHI NHIÊN LIỆU"
              logType="FUEL"
              tone="secondary"
            >
              <div className="service-worker-form-grid">
                <label>
                  Số lít
                  <input inputMode="decimal" name="fuelLiters" required />
                </label>
                <label>
                  Đơn giá / lít
                  <input inputMode="decimal" name="fuelUnitCost" required />
                </label>
              </div>
              <label>
                Ghi chú
                <input name="note" placeholder="Ví dụ: đổ giữa ca" />
              </label>
            </WorkerLogForm>
          ) : null}
          {allowed.includes("EVIDENCE") && data.evidence.length ? (
            <WorkerLogForm
              idempotencyKey={keyFor("EVIDENCE")}
              job={job}
              label="GẮN BẰNG CHỨNG"
              logType="EVIDENCE"
              tone="secondary"
            >
              <label>
                Ảnh / biên bản
                <select name="evidenceId" required>
                  {data.evidence.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ghi chú
                <input name="note" />
              </label>
            </WorkerLogForm>
          ) : null}
          {allowed.includes("INCIDENT") ? (
            <WorkerLogForm
              description="Giám sát được thông báo ngay; công việc không tự kết thúc."
              idempotencyKey={keyFor("INCIDENT")}
              job={job}
              label="BÁO SỰ CỐ"
              logType="INCIDENT"
              tone="risk"
            >
              <label>
                Mô tả sự cố
                <textarea name="note" placeholder="Ít nhất 10 ký tự" required />
              </label>
            </WorkerLogForm>
          ) : null}
          {allowed.includes("END") ? (
            <WorkerLogForm
              description="Kết thúc sẽ khóa giờ thực tế. Văn phòng vẫn phải duyệt riêng giờ và sản lượng tính tiền."
              idempotencyKey={keyFor("END")}
              job={job}
              label="KẾT THÚC CÔNG VIỆC"
              logType="END"
              tone="risk"
            >
              <label>
                Ghi chú bàn giao
                <input name="note" />
              </label>
            </WorkerLogForm>
          ) : null}
        </section>
      ) : (
        <p className="service-worker-wait">
          Công việc không còn thao tác hiện trường. Văn phòng đang xử lý bước
          tiếp theo.
        </p>
      )}
      {logs.length ? (
        <details className="service-worker-history">
          <summary>Nhật ký gần đây ({logs.length})</summary>
          <ol>
            {logs.map((log) => (
              <li key={log.id}>
                <Clock3 aria-hidden="true" />
                <span>
                  <strong>{SERVICE_LOG_LABELS[log.logType]}</strong>
                  <small>
                    {dateTime(log.occurredAt)}
                    {log.note ? ` · ${log.note}` : ""}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </article>
  );
}

export function ServiceJobWorker({
  data,
  initialKeys,
}: {
  data: ServiceJobSnapshot;
  initialKeys: Record<string, string>;
}) {
  return (
    <div className="service-worker-workspace">
      <header className="service-worker-header">
        <Construction aria-hidden="true" />
        <div>
          <p className="page-context">Máy & dịch vụ</p>
          <h1>Công việc dịch vụ của tôi</h1>
          <p>
            Ghi đúng lúc bắt đầu, nghỉ, nhiên liệu, sự cố và kết thúc. Hệ thống
            tự tính giờ thực tế.
          </p>
        </div>
      </header>
      <div className="service-worker-list">
        {data.jobs.map((job) => (
          <WorkerJobCard
            data={data}
            initialKeys={initialKeys}
            job={job}
            key={job.id}
          />
        ))}
      </div>
      {data.jobs.length === 0 ? (
        <p className="service-worker-empty">
          Chưa có công việc dịch vụ được giao.
        </p>
      ) : null}
    </div>
  );
}
