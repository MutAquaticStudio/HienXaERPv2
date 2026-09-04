"use client";

import {
  Banknote,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  Construction,
  Fuel,
  HardHat,
  MapPin,
  Plus,
  ReceiptText,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  runServiceJobAction,
  type ServiceJobActionState,
} from "@/app/app/service/actions";
import type {
  ServiceJobCommandKind,
  ServiceJobSnapshot,
  ServiceJobSummary,
} from "@/modules/service-jobs/types";
import {
  SERVICE_RATE_LABELS,
  SERVICE_STATUS_LABELS,
} from "@/modules/service-jobs/workflow";

const money = (value: string, currency = "VND") =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";

function ServiceForm({
  children,
  description,
  idempotencyKey,
  kind,
  label,
  tone = "primary",
}: {
  children: ReactNode;
  description?: string;
  idempotencyKey: string;
  kind: ServiceJobCommandKind;
  label: string;
  tone?: "primary" | "secondary" | "risk";
}) {
  const [state, action, pending] = useActionState(runServiceJobAction, {
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
      )
        control.value = value;
    }
  }, [state]);
  return (
    <form
      ref={formRef}
      action={action}
      className="service-form"
      onSubmit={(event) => {
        draft.current = Array.from(
          new FormData(event.currentTarget).entries(),
        ).flatMap(([name, value]) =>
          typeof value === "string" ? [[name, value] as [string, string]] : [],
        );
      }}
    >
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      {description ? (
        <p className="service-consequence">{description}</p>
      ) : null}
      <button
        aria-busy={pending}
        className={
          tone === "primary"
            ? "primary-button"
            : tone === "risk"
              ? "service-risk-button"
              : "secondary-button"
        }
        disabled={pending}
        type="submit"
      >
        {pending ? "Đang lưu…" : label}
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

function JobActions({
  canApprove,
  canAssign,
  canConfirm,
  canCost,
  canManage,
  data,
  job,
  keyFor,
}: {
  canApprove: boolean;
  canAssign: boolean;
  canConfirm: boolean;
  canCost: boolean;
  canManage: boolean;
  data: ServiceJobSnapshot;
  job: ServiceJobSummary;
  keyFor: (name: string) => string;
}) {
  const actualHours = Number(job.actualHours || 0).toFixed(2);
  return (
    <details className="service-actions">
      <summary>Thao tác công việc</summary>
      <div>
        {canAssign && ["SCHEDULED", "ASSIGNED"].includes(job.status) ? (
          <ServiceForm
            idempotencyKey={keyFor(`assign:${job.id}`)}
            kind="service.job.assign"
            label={
              job.status === "ASSIGNED" ? "Đổi người vận hành" : "Phân công"
            }
          >
            <input name="serviceJobId" type="hidden" value={job.id} />
            <label>
              Người vận hành
              <select
                defaultValue={job.operatorUserId ?? ""}
                name="operatorUserId"
                required
              >
                <option value="">Chọn người vận hành</option>
                {data.operators.map((operator) => (
                  <option key={operator.userId} value={operator.userId}>
                    {operator.employeeCode} · {operator.displayName}
                  </option>
                ))}
              </select>
            </label>
          </ServiceForm>
        ) : null}
        {canApprove && job.status === "COMPLETED" ? (
          <ServiceForm
            description="Giờ thực tế được giữ nguyên. Số được duyệt là căn cứ tính tiền và có thể khác thời gian máy chạy."
            idempotencyKey={keyFor(`approve:${job.id}`)}
            kind="service.job.approve"
            label="Duyệt tính tiền"
          >
            <input name="serviceJobId" type="hidden" value={job.id} />
            <input name="rateType" type="hidden" value={job.rateType} />
            <div className="service-form-grid">
              <label>
                Giờ thực tế
                <input disabled value={actualHours} />
              </label>
              <label>
                Giờ được duyệt
                <input
                  defaultValue={actualHours}
                  inputMode="decimal"
                  name="approvedBillableHours"
                  required
                />
              </label>
              <label>
                Sản lượng tính tiền
                <input
                  defaultValue={
                    job.rateType === "FIXED_JOB" ? "1" : actualHours
                  }
                  inputMode="decimal"
                  name="approvedBillableQuantity"
                  required
                />
              </label>
            </div>
            <label>
              Ghi chú duyệt
              <textarea
                minLength={10}
                name="note"
                placeholder="Nêu căn cứ duyệt (ít nhất 10 ký tự)"
                required
              />
            </label>
          </ServiceForm>
        ) : null}
        {canConfirm && job.status === "APPROVED" ? (
          <ServiceForm
            description={`Xác nhận sẽ tạo billing event và khoản phải thu ${money(String(Number(job.approvedBillableQuantity) * Number(job.unitRate)), job.currency)} đúng một lần.`}
            idempotencyKey={keyFor(`confirm:${job.id}`)}
            kind="service.job.confirm"
            label="Xác nhận và ghi phải thu"
          >
            <input name="serviceJobId" type="hidden" value={job.id} />
            <label>
              Đại diện khách hàng
              <input maxLength={160} name="customerRepresentative" required />
            </label>
            <label>
              Nội dung xác nhận
              <textarea
                minLength={10}
                name="confirmationNote"
                placeholder="Kết quả công việc khách hàng đã xác nhận"
                required
              />
            </label>
            <label>
              Biên bản / chữ ký (nếu có)
              <select name="signatureEvidenceId">
                <option value="">Không gắn tệp</option>
                {data.evidence.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </ServiceForm>
        ) : null}
        {canCost && !["CANCELLED"].includes(job.status) ? (
          <ServiceForm
            idempotencyKey={keyFor(`cost:${job.id}`)}
            kind="service.job.cost"
            label="Ghi chi phí"
            tone="secondary"
          >
            <input name="serviceJobId" type="hidden" value={job.id} />
            <div className="service-form-grid">
              <label>
                Loại chi phí
                <select name="category">
                  <option value="MACHINE">Máy móc</option>
                  <option value="DIRECT_LABOR">Nhân công trực tiếp</option>
                  <option value="FUEL">Nhiên liệu</option>
                  <option value="OTHER">Chi phí khác</option>
                </select>
              </label>
              <label>
                Số tiền
                <input inputMode="decimal" name="amount" required />
              </label>
              <label>
                Thời điểm
                <input name="occurredAt" required type="datetime-local" />
              </label>
            </div>
            <label>
              Diễn giải
              <input minLength={5} name="note" required />
            </label>
          </ServiceForm>
        ) : null}
        {canManage && ["SCHEDULED", "ASSIGNED"].includes(job.status) ? (
          <ServiceForm
            description="Chỉ hủy được trước khi công việc bắt đầu; WorkItem liên quan cũng chuyển sang đã hủy."
            idempotencyKey={keyFor(`cancel:${job.id}`)}
            kind="service.job.cancel"
            label="Hủy công việc"
            tone="risk"
          >
            <input name="serviceJobId" type="hidden" value={job.id} />
            <label>
              Lý do hủy
              <textarea minLength={10} name="reason" required />
            </label>
          </ServiceForm>
        ) : null}
      </div>
    </details>
  );
}

export function ServiceJobCommandCenter({
  canApprove,
  canAssign,
  canConfirm,
  canCost,
  canManage,
  data,
  initialKeys,
}: {
  canApprove: boolean;
  canAssign: boolean;
  canConfirm: boolean;
  canCost: boolean;
  canManage: boolean;
  data: ServiceJobSnapshot;
  initialKeys: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const jobs = useMemo(
    () =>
      data.jobs.filter(
        (job) =>
          (status === "ALL" || job.status === status) &&
          `${job.jobNumber} ${job.customerName} ${job.siteName} ${job.machineName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [data.jobs, query, status],
  );
  const active = data.jobs.filter((job) =>
    ["ASSIGNED", "IN_PROGRESS", "PAUSED"].includes(job.status),
  ).length;
  const awaiting = data.jobs.filter((job) =>
    ["COMPLETED", "APPROVED"].includes(job.status),
  ).length;
  const revenue = data.jobs.reduce(
    (sum, job) => sum + Number(job.recognizedRevenue),
    0,
  );
  const profit = data.jobs.reduce(
    (sum, job) => sum + Number(job.contributionProfit),
    0,
  );
  const keyFor = (name: string) => initialKeys[name] ?? `service-${name}`;
  return (
    <div className="service-workspace">
      <header className="service-header">
        <div>
          <p className="page-context">Dịch vụ & máy công trình</p>
          <h1>Điều hành ServiceJob từ lịch đến phải thu</h1>
          <p>
            Mỗi thao tác hiện trường là một nhật ký bất biến. Giờ chạy thực tế,
            giờ được duyệt và sản lượng tính tiền luôn tách riêng.
          </p>
        </div>
        <Construction aria-hidden="true" size={54} />
      </header>
      <section aria-label="Chỉ số công việc dịch vụ" className="service-kpis">
        <article>
          <HardHat aria-hidden="true" />
          <span>Đang vận hành</span>
          <strong>{active}</strong>
        </article>
        <article>
          <ClipboardCheck aria-hidden="true" />
          <span>Chờ duyệt / xác nhận</span>
          <strong>{awaiting}</strong>
        </article>
        <article>
          <CircleDollarSign aria-hidden="true" />
          <span>Doanh thu đã ghi nhận</span>
          <strong>{money(String(revenue))}</strong>
        </article>
        <article>
          <Banknote aria-hidden="true" />
          <span>Lợi nhuận đóng góp</span>
          <strong>{money(String(profit))}</strong>
        </article>
      </section>

      {canManage ? (
        <section
          className="service-catalog"
          aria-labelledby="service-create-title"
        >
          <div className="service-section-heading">
            <div>
              <p>THIẾT LẬP & LẬP LỊCH</p>
              <h2 id="service-create-title">Tạo dữ liệu vận hành</h2>
            </div>
            <Plus aria-hidden="true" />
          </div>
          <div className="service-create-grid">
            <details>
              <summary>Thêm loại dịch vụ</summary>
              <ServiceForm
                idempotencyKey={keyFor("type:new")}
                kind="service.type.create"
                label="Tạo loại dịch vụ"
              >
                <div className="service-form-grid">
                  <label>
                    Mã dịch vụ
                    <input maxLength={32} name="code" required />
                  </label>
                  <label>
                    Tên dịch vụ
                    <input maxLength={160} name="name" required />
                  </label>
                  <label>
                    Cách tính giá
                    <select name="rateType">
                      <option value="HOUR">Theo giờ</option>
                      <option value="SHIFT">Theo ca</option>
                      <option value="TRIP">Theo chuyến</option>
                      <option value="DAY">Theo ngày</option>
                      <option value="FIXED_JOB">Trọn công việc</option>
                    </select>
                  </label>
                  <label>
                    Đơn giá mặc định
                    <input inputMode="decimal" name="unitRate" required />
                  </label>
                  <label>
                    Số giờ một ca
                    <input
                      defaultValue="8"
                      inputMode="decimal"
                      name="standardShiftHours"
                      required
                    />
                  </label>
                </div>
              </ServiceForm>
            </details>
            <details>
              <summary>Thêm máy</summary>
              <ServiceForm
                idempotencyKey={keyFor("machine:new")}
                kind="service.machine.create"
                label="Tạo máy"
              >
                <div className="service-form-grid">
                  <label>
                    Mã máy
                    <input maxLength={32} name="code" required />
                  </label>
                  <label>
                    Tên máy
                    <input maxLength={160} name="name" required />
                  </label>
                  <label>
                    Loại máy
                    <input maxLength={100} name="machineType" required />
                  </label>
                  <label>
                    Số sê-ri
                    <input maxLength={120} name="serialNumber" />
                  </label>
                  <label>
                    Kho quản lý
                    <select name="warehouseId">
                      <option value="">Chưa gán kho</option>
                      {data.warehouses.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Giờ đồng hồ
                    <input
                      defaultValue="0"
                      inputMode="decimal"
                      name="meterHours"
                    />
                  </label>
                </div>
              </ServiceForm>
            </details>
            <details open>
              <summary>Lên lịch công việc</summary>
              <ServiceForm
                idempotencyKey={keyFor("job:new")}
                kind="service.job.create"
                label="Tạo lịch dịch vụ"
              >
                <div className="service-form-grid">
                  <label>
                    Khách hàng
                    <select name="customerId" required>
                      <option value="">Chọn khách hàng</option>
                      {data.customers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Địa điểm
                    <select name="customerSiteId" required>
                      <option value="">Chọn địa điểm</option>
                      {data.sites.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.address}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Loại dịch vụ
                    <select name="serviceTypeId" required>
                      <option value="">Chọn dịch vụ</option>
                      {data.serviceTypes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Máy
                    <select name="machineId" required>
                      <option value="">Chọn máy</option>
                      {data.machines.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name} (
                          {item.status === "AVAILABLE"
                            ? "Sẵn sàng"
                            : "Đã có lịch"}
                          )
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bắt đầu dự kiến
                    <input
                      name="scheduledStartAt"
                      required
                      type="datetime-local"
                    />
                  </label>
                  <label>
                    Kết thúc dự kiến
                    <input
                      name="scheduledEndAt"
                      required
                      type="datetime-local"
                    />
                  </label>
                  <label>
                    Cách tính giá
                    <select name="rateType">
                      <option value="HOUR">Theo giờ</option>
                      <option value="SHIFT">Theo ca</option>
                      <option value="TRIP">Theo chuyến</option>
                      <option value="DAY">Theo ngày</option>
                      <option value="FIXED_JOB">Trọn công việc</option>
                    </select>
                  </label>
                  <label>
                    Đơn giá
                    <input inputMode="decimal" name="unitRate" required />
                  </label>
                  <label>
                    Tiền tệ
                    <input
                      defaultValue="VND"
                      maxLength={3}
                      name="currency"
                      required
                    />
                  </label>
                </div>
                <label>
                  Ghi chú
                  <textarea maxLength={1000} name="notes" />
                </label>
              </ServiceForm>
            </details>
          </div>
        </section>
      ) : null}

      <section
        className="service-jobs-panel"
        aria-labelledby="service-list-title"
      >
        <div className="service-section-heading">
          <div>
            <p>VÒNG ĐỜI CÔNG VIỆC</p>
            <h2 id="service-list-title">Công việc dịch vụ</h2>
          </div>
          <span>{jobs.length} công việc</span>
        </div>
        <div className="service-filters">
          <label>
            Tìm công việc
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Mã, khách hàng, máy…"
              type="search"
              value={query}
            />
          </label>
          <label>
            Trạng thái
            <select
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="ALL">Tất cả</option>
              {Object.entries(SERVICE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="service-job-list">
          {jobs.map((job) => (
            <article className="service-job-card" key={job.id}>
              <header>
                <div>
                  <span className="service-number">{job.jobNumber}</span>
                  <h3>{job.serviceTypeName}</h3>
                  <p>
                    <MapPin aria-hidden="true" /> {job.customerName} ·{" "}
                    {job.siteName}
                  </p>
                </div>
                <span
                  className={`service-status status-${job.status.toLowerCase()}`}
                >
                  {SERVICE_STATUS_LABELS[job.status]}
                </span>
              </header>
              <div className="service-job-facts">
                <div>
                  <Construction aria-hidden="true" />
                  <span>Máy</span>
                  <strong>{job.machineName}</strong>
                </div>
                <div>
                  <UserRoundCheck aria-hidden="true" />
                  <span>Người vận hành</span>
                  <strong>{job.operatorName ?? "Chưa phân công"}</strong>
                </div>
                <div>
                  <CalendarClock aria-hidden="true" />
                  <span>Lịch</span>
                  <strong>{dateTime(job.scheduledStartAt)}</strong>
                </div>
                <div>
                  <Wrench aria-hidden="true" />
                  <span>Địa chỉ</span>
                  <strong>{job.siteAddress}</strong>
                </div>
              </div>
              <div className="service-finance-strip">
                <div>
                  <span>Giờ thực tế</span>
                  <strong>{Number(job.actualHours).toFixed(2)}</strong>
                </div>
                <div>
                  <span>Giờ được duyệt</span>
                  <strong>{job.approvedBillableHours ?? "—"}</strong>
                </div>
                <div>
                  <span>{SERVICE_RATE_LABELS[job.rateType]}</span>
                  <strong>{money(job.unitRate, job.currency)}</strong>
                </div>
                <div>
                  <span>Doanh thu</span>
                  <strong>{money(job.recognizedRevenue, job.currency)}</strong>
                </div>
                <div>
                  <span>Chi phí</span>
                  <strong>{money(job.actualCost, job.currency)}</strong>
                </div>
                <div>
                  <span>Lợi nhuận</span>
                  <strong
                    className={
                      Number(job.contributionProfit) < 0
                        ? "service-negative"
                        : "service-positive"
                    }
                  >
                    {money(job.contributionProfit, job.currency)}
                  </strong>
                </div>
              </div>
              {job.notes ? <p className="service-note">{job.notes}</p> : null}
              <JobActions
                canApprove={canApprove}
                canAssign={canAssign}
                canConfirm={canConfirm}
                canCost={canCost}
                canManage={canManage}
                data={data}
                job={job}
                keyFor={keyFor}
              />
            </article>
          ))}
        </div>
        {jobs.length === 0 ? (
          <p className="service-empty">Không có công việc phù hợp bộ lọc.</p>
        ) : null}
      </section>
      <aside className="service-policy">
        <ReceiptText aria-hidden="true" />
        <p>
          <strong>Nguyên tắc kế toán:</strong> chỉ sau khi duyệt và khách hàng
          xác nhận, hệ thống mới tạo billing event rồi ghi khoản phải thu. Nhật
          ký hiện trường không tự phát sinh doanh thu.
        </p>
        <Fuel aria-hidden="true" />
      </aside>
    </div>
  );
}
