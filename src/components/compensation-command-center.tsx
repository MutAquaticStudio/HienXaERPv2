"use client";

import {
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarCheck2,
  CheckCircle2,
  CircleDollarSign,
  FileClock,
  Scale,
  ShieldCheck,
  UsersRound,
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
  runCompensationAction,
  type CompensationActionState,
} from "@/app/app/compensation/actions";
import {
  COMPENSATION_RULE_TYPES,
  type CompensationCommandKind,
  type CompensationPlanScope,
  type CompensationRuleType,
  type CompensationSnapshot,
  type EarningEventStatus,
} from "@/modules/compensation/types";

const money = (value: string, currency = "VND") =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
const date = (value: string) =>
  new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
const ruleLabels: Record<CompensationRuleType, string> = {
  FIXED_MONTHLY: "Cố định theo tháng",
  PER_JOB: "Theo công việc",
  PER_TRIP: "Theo chuyến",
  PER_HOUR: "Theo giờ",
  PER_SHIFT: "Theo ca",
  PER_DAY: "Theo ngày",
  PER_TON: "Theo tấn",
  PER_M3: "Theo m³",
  PER_BAG: "Theo bao",
  PER_UNIT: "Theo đơn vị",
  PERCENT_GROSS_PROFIT: "Theo % lợi nhuận gộp",
  BONUS: "Thưởng",
  ADJUSTMENT: "Điều chỉnh",
};
const statusLabels: Record<EarningEventStatus, string> = {
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REVERSED: "Đã đảo",
};
const scopeLabels: Record<CompensationPlanScope, string> = {
  COMPANY: "Toàn công ty",
  ROLE: "Theo vai trò",
  EMPLOYEE: "Riêng nhân viên",
};

function CommandForm({
  children,
  consequence,
  idempotencyKey,
  kind,
  label,
  tone = "primary",
}: {
  children: ReactNode;
  consequence?: string;
  idempotencyKey: string | undefined;
  kind: CompensationCommandKind;
  label: string;
  tone?: "primary" | "secondary" | "risk";
}) {
  const initial: CompensationActionState = {
    status: "idle",
    message: "",
    idempotencyKey: idempotencyKey ?? `${kind}-p12-key`,
  };
  const [state, action, pending] = useActionState(
    runCompensationAction,
    initial,
  );
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
      action={action}
      className="compensation-form"
      onSubmit={(event) => {
        draft.current = Array.from(
          new FormData(event.currentTarget).entries(),
        ).flatMap(([name, value]) =>
          typeof value === "string" ? [[name, value] as [string, string]] : [],
        );
      }}
      ref={formRef}
    >
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      {consequence ? (
        <p className="compensation-consequence">
          <ShieldCheck aria-hidden="true" />
          {consequence}
        </p>
      ) : null}
      <button
        aria-busy={pending}
        className={
          tone === "risk"
            ? "compensation-risk-button"
            : tone === "secondary"
              ? "secondary-button"
              : "primary-button"
        }
        disabled={pending}
        type="submit"
      >
        {pending ? "Đang lưu…" : label}
      </button>
      {state.status !== "idle" ? (
        <p
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

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function CompensationCommandCenter({
  canAdjust,
  canApprove,
  canClosePayroll,
  canManage,
  data,
  initialKeys,
}: {
  canAdjust: boolean;
  canApprove: boolean;
  canClosePayroll: boolean;
  canManage: boolean;
  data: CompensationSnapshot;
  initialKeys: Record<string, string>;
}) {
  const [tab, setTab] = useState<"earnings" | "plans" | "payroll">("earnings");
  const [planScope, setPlanScope] = useState<CompensationPlanScope>("ROLE");
  const approved = useMemo(
    () =>
      data.events
        .filter((event) => event.status === "APPROVED")
        .reduce((sum, event) => sum + Number(event.totalAmount), 0),
    [data.events],
  );
  const pending = useMemo(
    () =>
      data.events
        .filter((event) => event.status === "PENDING_APPROVAL")
        .reduce((sum, event) => sum + Number(event.totalAmount), 0),
    [data.events],
  );
  const paid = useMemo(
    () =>
      data.periods.reduce((sum, period) => sum + Number(period.totalPaid), 0),
    [data.periods],
  );
  const currentDate = "2026-09-04";
  return (
    <section
      className="compensation-workspace"
      aria-labelledby="compensation-heading"
    >
      <header className="compensation-header">
        <div>
          <p className="page-context">Nhân sự · quyền lợi · đối soát</p>
          <h1 id="compensation-heading">
            Thu nhập và sản lượng từ việc đã xác minh
          </h1>
          <p>
            Tính đúng theo kế hoạch có hiệu lực, duyệt trước khi chốt kỳ và chỉ
            liên kết tiền sau khi khoản chi đã được ghi nhận.
          </p>
        </div>
        <BadgeDollarSign aria-hidden="true" size={54} />
      </header>

      <div className="compensation-metrics" aria-label="Tổng quan thu nhập">
        <article>
          <CheckCircle2 />
          <span>Đã duyệt</span>
          <strong>{money(String(approved))}</strong>
        </article>
        <article>
          <FileClock />
          <span>Chờ duyệt</span>
          <strong>{money(String(pending))}</strong>
        </article>
        <article>
          <CircleDollarSign />
          <span>Đã liên kết khoản chi</span>
          <strong>{money(String(paid))}</strong>
        </article>
        <article>
          <UsersRound />
          <span>Hồ sơ đang hiệu lực</span>
          <strong>
            {data.profiles.filter((profile) => profile.isActive).length}
          </strong>
        </article>
      </div>

      <aside className="compensation-invariant">
        <Scale aria-hidden="true" />
        <div>
          <strong>Quyền lợi không đồng nghĩa đã trả tiền</strong>
          <p>
            Duyệt quyền lợi xác nhận số người lao động được hưởng. Khoản chi
            thực tế vẫn được tạo và kiểm soát tại Tài chính, sau đó mới liên kết
            để đối soát.
          </p>
        </div>
      </aside>

      <div
        className="compensation-tabs"
        role="tablist"
        aria-label="Khu vực thu nhập"
      >
        {(
          [
            ["earnings", "Quyền lợi", BriefcaseBusiness],
            ["plans", "Kế hoạch tính", UsersRound],
            ["payroll", "Kỳ thu nhập", CalendarCheck2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            aria-controls={`compensation-panel-${id}`}
            aria-selected={tab === id}
            id={`compensation-tab-${id}`}
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "earnings" ? (
        <div
          aria-labelledby="compensation-tab-earnings"
          className="compensation-panel"
          id="compensation-panel-earnings"
          role="tabpanel"
        >
          <div className="compensation-section-heading">
            <div>
              <h2>Quyền lợi cần xử lý</h2>
              <p>
                Chỉ công việc ở trạng thái đã xác minh mới có thể tạo quyền lợi
                phải trả.
              </p>
            </div>
          </div>
          {canManage && data.verifiedWork.length ? (
            <details className="compensation-command">
              <summary>Tính quyền lợi từ công việc đã xác minh</summary>
              <CommandForm
                consequence="Thao tác chỉ tạo quyền lợi chờ duyệt; chưa phát sinh khoản chi."
                idempotencyKey={initialKeys[`work:${data.verifiedWork[0]!.id}`]}
                kind="earning.create_from_work"
                label="TẠO QUYỀN LỢI CHỜ DUYỆ"
              >
                <div className="compensation-form-grid">
                  <Field label="Công việc">
                    <select
                      name="workItemId"
                      defaultValue={data.verifiedWork[0]!.id}
                    >
                      {data.verifiedWork.map((work) => (
                        <option key={work.id} value={work.id}>
                          {work.workNumber} · {work.workerName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cách tính">
                    <select name="ruleType" defaultValue="PER_TRIP">
                      {COMPENSATION_RULE_TYPES.filter(
                        (item) =>
                          !["FIXED_MONTHLY", "BONUS", "ADJUSTMENT"].includes(
                            item,
                          ),
                      ).map((item) => (
                        <option key={item} value={item}>
                          {ruleLabels[item]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cách chia">
                    <select name="allocationMode" defaultValue="PERCENT">
                      <option value="PERCENT">Theo tỷ lệ %</option>
                      <option value="UNITS">Theo sản lượng duyệt</option>
                    </select>
                  </Field>
                  <Field label="Người nhận 1">
                    <select
                      name="workerUserId1"
                      defaultValue={data.verifiedWork[0]!.workerUserId}
                    >
                      {data.workers.map((worker) => (
                        <option key={worker.userId} value={worker.userId}>
                          {worker.employeeCode} · {worker.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tỷ lệ người 1">
                    <input
                      name="sharePercent1"
                      defaultValue="100"
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Sản lượng người 1">
                    <input
                      name="approvedUnits1"
                      inputMode="decimal"
                      placeholder="Dùng khi chia theo sản lượng"
                    />
                  </Field>
                  <Field label="Người nhận 2 (nếu có)">
                    <select name="workerUserId2" defaultValue="">
                      <option value="">Không chia thêm</option>
                      {data.workers.map((worker) => (
                        <option key={worker.userId} value={worker.userId}>
                          {worker.employeeCode} · {worker.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tỷ lệ người 2">
                    <input
                      name="sharePercent2"
                      inputMode="decimal"
                      placeholder="Ví dụ 40"
                    />
                  </Field>
                  <Field label="Sản lượng người 2">
                    <input
                      name="approvedUnits2"
                      inputMode="decimal"
                      placeholder="Dùng khi chia theo sản lượng"
                    />
                  </Field>
                </div>
                <Field label="Ghi chú căn cứ">
                  <textarea
                    name="note"
                    defaultValue="Tính theo biên bản xác minh và phân công thực tế"
                    required
                  />
                </Field>
              </CommandForm>
            </details>
          ) : null}
          {canManage && data.workers.length ? (
            <details className="compensation-command">
              <summary>Đề xuất khoản thưởng</summary>
              <CommandForm
                consequence="Khoản thưởng dùng mức trong kế hoạch có hiệu lực và vẫn phải được duyệt."
                idempotencyKey={initialKeys["bonus:new"]}
                kind="earning.bonus"
                label="GHI ĐỀ XUẤT THƯỞNG"
              >
                <div className="compensation-form-grid">
                  <Field label="Nhân viên">
                    <select name="employeeUserId">
                      {data.workers.map((worker) => (
                        <option key={worker.userId} value={worker.userId}>
                          {worker.employeeCode} · {worker.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ngày ghi nhận">
                    <input
                      name="earnedOn"
                      type="date"
                      defaultValue={currentDate}
                    />
                  </Field>
                </div>
                <Field label="Lý do thưởng">
                  <textarea
                    name="note"
                    placeholder="Nêu thành tích và căn cứ xét thưởng"
                    required
                  />
                </Field>
              </CommandForm>
            </details>
          ) : null}
          <div className="earning-list">
            {data.events.map((event) => (
              <article
                className={`earning-card earning-${event.status.toLowerCase()}`}
                key={event.id}
              >
                <header>
                  <div>
                    <span>
                      {event.eventNumber} · {event.sourceNumber}
                    </span>
                    <h2>{event.description}</h2>
                  </div>
                  <strong>{statusLabels[event.status]}</strong>
                </header>
                <dl>
                  <div>
                    <dt>Căn cứ</dt>
                    <dd>
                      {event.basisQuantity} · {event.basisLabel}
                    </dd>
                  </div>
                  <div>
                    <dt>Ngày ghi nhận</dt>
                    <dd>{date(event.earnedOn)}</dd>
                  </div>
                  <div>
                    <dt>Quyền lợi</dt>
                    <dd>{money(event.totalAmount, event.currency)}</dd>
                  </div>
                </dl>
                <div className="earning-allocations">
                  {event.allocations.map((allocation) => (
                    <div key={allocation.id}>
                      <span>
                        {allocation.employeeCode} · {allocation.workerName}
                      </span>
                      <strong>
                        {money(allocation.netAmount, event.currency)}
                      </strong>
                      <small>
                        {ruleLabels[allocation.ruleType]} · mức chụp{" "}
                        {money(allocation.rateSnapshot, event.currency)}
                      </small>
                    </div>
                  ))}
                </div>
                {event.status === "PENDING_APPROVAL" && canApprove ? (
                  <details className="compensation-command">
                    <summary>Duyệt quyền lợi</summary>
                    <CommandForm
                      consequence="Sau khi duyệt, khoản này có thể được đưa vào kỳ thu nhập; vẫn chưa phải là tiền đã trả."
                      idempotencyKey={initialKeys[`approve:${event.id}`]}
                      kind="earning.approve"
                      label="DUYỆT QUYỀN LỢI"
                    >
                      <input
                        name="earningEventId"
                        type="hidden"
                        value={event.id}
                      />
                      <Field label="Ghi chú duyệt">
                        <textarea
                          name="note"
                          placeholder="Nêu căn cứ duyệt quyền lợi"
                          required
                        />
                      </Field>
                    </CommandForm>
                  </details>
                ) : null}
                {event.status === "PENDING_APPROVAL" && canAdjust
                  ? event.allocations.map((allocation) => (
                      <details
                        className="compensation-command"
                        key={`adjust-${allocation.id}`}
                      >
                        <summary>
                          Điều chỉnh cho {allocation.workerName}
                        </summary>
                        <CommandForm
                          consequence="Điều chỉnh được ghi thành dòng lịch sử riêng; số trước điều chỉnh không bị xóa."
                          idempotencyKey={
                            initialKeys[`adjust:${allocation.id}`]
                          }
                          kind="earning.adjust"
                          label="GHI ĐIỀU CHỈNH"
                          tone="secondary"
                        >
                          <input
                            name="earningAllocationId"
                            type="hidden"
                            value={allocation.id}
                          />
                          <div className="compensation-form-grid">
                            <Field label="Số tiền tăng/giảm">
                              <input
                                name="amount"
                                inputMode="decimal"
                                placeholder="Ví dụ -150000"
                              />
                            </Field>
                            <Field label="Lý do điều chỉnh">
                              <textarea
                                name="reason"
                                placeholder="Ít nhất 10 ký tự"
                                required
                              />
                            </Field>
                          </div>
                        </CommandForm>
                      </details>
                    ))
                  : null}
                {event.status !== "REVERSED" && canAdjust ? (
                  <details className="compensation-command compensation-command-risk">
                    <summary>Đảo quyền lợi</summary>
                    <CommandForm
                      consequence="Quyền lợi ngừng được tính; bản ghi gốc và khoản chi đã liên kết (nếu có) vẫn còn để đối soát."
                      idempotencyKey={initialKeys[`reverse:${event.id}`]}
                      kind="earning.reverse"
                      label="XÁC NHẬN ĐẢO"
                      tone="risk"
                    >
                      <input
                        name="earningEventId"
                        type="hidden"
                        value={event.id}
                      />
                      <Field label="Lý do đảo">
                        <textarea
                          name="reason"
                          placeholder="Nêu sai sót hoặc nguồn công việc bị hủy"
                          required
                        />
                      </Field>
                    </CommandForm>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "plans" ? (
        <div
          aria-labelledby="compensation-tab-plans"
          className="compensation-panel"
          id="compensation-panel-plans"
          role="tabpanel"
        >
          <div className="compensation-section-heading">
            <div>
              <h2>Kế hoạch và phiên bản hiệu lực</h2>
              <p>
                Ưu tiên áp dụng: riêng nhân viên, sau đó theo vai trò, cuối cùng
                là mặc định công ty.
              </p>
            </div>
          </div>
          {canManage ? (
            <div className="compensation-setup-grid">
              <details className="compensation-command">
                <summary>Tạo phiên bản hồ sơ nhân viên</summary>
                <CommandForm
                  consequence="Phiên bản hiện tại sẽ kết thúc trước ngày bắt đầu mới; lịch sử vẫn được giữ."
                  idempotencyKey={initialKeys["profile:new"]}
                  kind="compensation.profile.create"
                  label="TẠO PHIÊN BẢN HỒ SƠ"
                >
                  <Field label="Nhân viên">
                    <select name="employeeUserId">
                      {data.workers.map((worker) => (
                        <option key={worker.userId} value={worker.userId}>
                          {worker.employeeCode} · {worker.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ngày bắt đầu">
                    <input
                      name="effectiveFrom"
                      type="date"
                      defaultValue={currentDate}
                    />
                  </Field>
                  <Field label="Ghi chú">
                    <textarea
                      name="note"
                      defaultValue="Cập nhật hồ sơ thu nhập theo quyết định đã duyệt"
                      required
                    />
                  </Field>
                </CommandForm>
              </details>
              <details className="compensation-command">
                <summary>Tạo phiên bản kế hoạch</summary>
                <CommandForm
                  consequence="Không thể ghi đè khoảng hiệu lực đang có cùng phạm vi."
                  idempotencyKey={initialKeys["plan:new"]}
                  kind="compensation.plan.create"
                  label="TẠO KẾ HOẠCH"
                >
                  <div className="compensation-form-grid">
                    <Field label="Mã kế hoạch">
                      <input name="planCode" placeholder="TX-CHUYEN" required />
                    </Field>
                    <Field label="Tên kế hoạch">
                      <input
                        name="name"
                        placeholder="Thu nhập theo chuyến tài xế"
                        required
                      />
                    </Field>
                    <Field label="Phiên bản">
                      <input
                        name="versionNumber"
                        type="number"
                        min="1"
                        defaultValue="1"
                      />
                    </Field>
                    <Field label="Phạm vi">
                      <select
                        name="scopeType"
                        value={planScope}
                        onChange={(event) =>
                          setPlanScope(
                            event.target.value as CompensationPlanScope,
                          )
                        }
                      >
                        <option value="COMPANY">Toàn công ty</option>
                        <option value="ROLE">Theo vai trò</option>
                        <option value="EMPLOYEE">Riêng nhân viên</option>
                      </select>
                    </Field>
                    {planScope === "ROLE" ? (
                      <Field label="Vai trò">
                        <select name="roleCode" defaultValue="DRIVER">
                          <option value="DRIVER">Tài xế</option>
                          <option value="OPERATOR_WORKER">Vận hành</option>
                          <option value="SALES">Kinh doanh</option>
                          <option value="WAREHOUSE">Kho</option>
                        </select>
                      </Field>
                    ) : null}
                    {planScope === "EMPLOYEE" ? (
                      <Field label="Nhân viên">
                        <select name="employeeUserId">
                          {data.workers.map((worker) => (
                            <option key={worker.userId} value={worker.userId}>
                              {worker.employeeCode} · {worker.displayName}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    <Field label="Ngày hiệu lực">
                      <input
                        name="effectiveFrom"
                        type="date"
                        defaultValue={currentDate}
                      />
                    </Field>
                    <Field label="Ngày kết thúc (nếu có)">
                      <input name="effectiveTo" type="date" />
                    </Field>
                    <Field label="Tiền tệ">
                      <input name="currency" defaultValue="VND" maxLength={3} />
                    </Field>
                  </div>
                  <Field label="Ghi chú phiên bản">
                    <textarea
                      name="note"
                      defaultValue="Áp dụng theo quyết định thu nhập đã được phê duyệt"
                      required
                    />
                  </Field>
                </CommandForm>
              </details>
              {data.plans.length ? (
                <details className="compensation-command">
                  <summary>Thêm cách tính vào kế hoạch</summary>
                  <CommandForm
                    consequence="Mức và phiên bản sẽ được chụp vào từng quyền lợi để bảo toàn lịch sử."
                    idempotencyKey={initialKeys["rule:new"]}
                    kind="compensation.rule.create"
                    label="THÊM CÁCH TÍNH"
                  >
                    <div className="compensation-form-grid">
                      <Field label="Kế hoạch">
                        <select name="planVersionId">
                          {data.plans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.planCode} · v{plan.versionNumber}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Cách tính">
                        <select name="ruleType">
                          {COMPENSATION_RULE_TYPES.map((item) => (
                            <option key={item} value={item}>
                              {ruleLabels[item]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Mức trả">
                        <input
                          name="rate"
                          inputMode="decimal"
                          placeholder="350000"
                          required
                        />
                      </Field>
                      <Field label="Loại việc (nếu giới hạn)">
                        <select name="workType" defaultValue="">
                          <option value="">Mọi loại việc</option>
                          <option value="DELIVERY">Giao hàng</option>
                          <option value="OPERATION">Vận hành</option>
                          <option value="GENERAL">Công việc chung</option>
                        </select>
                      </Field>
                      <Field label="Nguồn việc (nếu giới hạn)">
                        <select name="sourceType" defaultValue="">
                          <option value="">Mọi nguồn</option>
                          <option value="DELIVERY">Chuyến giao</option>
                          <option value="SERVICE_JOB">Dịch vụ máy</option>
                          <option value="GENERAL">Công việc chung</option>
                        </select>
                      </Field>
                    </div>
                    <Field label="Mô tả cách tính">
                      <textarea
                        name="description"
                        placeholder="Nêu rõ điều kiện và đơn vị được hưởng"
                        required
                      />
                    </Field>
                  </CommandForm>
                </details>
              ) : null}
            </div>
          ) : null}
          <div className="compensation-plan-list">
            {data.plans.map((plan) => (
              <article key={plan.id}>
                <header>
                  <div>
                    <span>
                      {plan.planCode} · v{plan.versionNumber}
                    </span>
                    <h2>{plan.name}</h2>
                  </div>
                  <strong>{scopeLabels[plan.scopeType]}</strong>
                </header>
                <p>
                  Hiệu lực {date(plan.effectiveFrom)}
                  {plan.effectiveTo
                    ? ` – ${date(plan.effectiveTo)}`
                    : " – không giới hạn"}
                </p>
                <div>
                  {data.rules
                    .filter((rule) => rule.planVersionId === plan.id)
                    .map((rule) => (
                      <p key={rule.id}>
                        <b>{ruleLabels[rule.ruleType]}</b>
                        <span>
                          {money(rule.rate, plan.currency)} · {rule.description}
                        </span>
                      </p>
                    ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "payroll" ? (
        <div
          aria-labelledby="compensation-tab-payroll"
          className="compensation-panel"
          id="compensation-panel-payroll"
          role="tabpanel"
        >
          <div className="compensation-section-heading">
            <div>
              <h2>Kỳ thu nhập và đối soát khoản chi</h2>
              <p>
                Chốt quyền lợi theo kỳ trước, sau đó liên kết với khoản chi đã
                đăng sổ tại Tài chính.
              </p>
            </div>
          </div>
          {canClosePayroll ? (
            <details className="compensation-command">
              <summary>Mở kỳ thu nhập mới</summary>
              <CommandForm
                consequence="Các khoản chờ duyệt phải được xử lý xong trước khi chốt kỳ."
                idempotencyKey={initialKeys["period:new"]}
                kind="payroll.period.create"
                label="MỞ KỲ THU NHẬP"
              >
                <div className="compensation-form-grid">
                  <Field label="Mã kỳ">
                    <input name="periodCode" placeholder="2026-09" required />
                  </Field>
                  <Field label="Ngày đầu kỳ">
                    <input
                      name="periodStart"
                      type="date"
                      defaultValue="2026-09-01"
                    />
                  </Field>
                  <Field label="Ngày cuối kỳ">
                    <input
                      name="periodEnd"
                      type="date"
                      defaultValue="2026-09-30"
                    />
                  </Field>
                  <Field label="Tiền tệ">
                    <input name="currency" defaultValue="VND" maxLength={3} />
                  </Field>
                </div>
                <Field label="Ghi chú">
                  <textarea
                    name="note"
                    defaultValue="Kỳ thu nhập tháng chín theo lịch đối soát công ty"
                    required
                  />
                </Field>
              </CommandForm>
            </details>
          ) : null}
          <div className="payroll-list">
            {data.periods.map((period) => (
              <article key={period.id}>
                <header>
                  <div>
                    <span>{period.periodCode}</span>
                    <h2>
                      {date(period.periodStart)} – {date(period.periodEnd)}
                    </h2>
                  </div>
                  <strong>
                    {period.status === "OPEN" ? "Đang mở" : "Đã chốt"}
                  </strong>
                </header>
                <dl>
                  <div>
                    <dt>Quyền lợi</dt>
                    <dd>{money(period.totalEntitlement, period.currency)}</dd>
                  </div>
                  <div>
                    <dt>Đã liên kết chi</dt>
                    <dd>{money(period.totalPaid, period.currency)}</dd>
                  </div>
                  <div>
                    <dt>Số nhân viên</dt>
                    <dd>{period.lineCount}</dd>
                  </div>
                </dl>
                {period.status === "OPEN" && canManage ? (
                  <CommandForm
                    idempotencyKey={initialKeys[`generate:${period.id}`]}
                    kind="payroll.monthly.generate"
                    label="SINH KHOẢN CỐ ĐỊNH"
                    tone="secondary"
                  >
                    <input
                      name="payrollPeriodId"
                      type="hidden"
                      value={period.id}
                    />
                  </CommandForm>
                ) : null}
                {period.status === "OPEN" && canClosePayroll ? (
                  <CommandForm
                    consequence="Sau khi chốt, dòng thu nhập và mức đã chụp không thể sửa."
                    idempotencyKey={initialKeys[`close:${period.id}`]}
                    kind="payroll.close"
                    label="CHỐT KỲ THU NHẬP"
                  >
                    <input
                      name="payrollPeriodId"
                      type="hidden"
                      value={period.id}
                    />
                    <Field label="Xác nhận chốt kỳ">
                      <textarea
                        name="note"
                        placeholder="Xác nhận đã đối soát đủ quyền lợi trong kỳ"
                        required
                      />
                    </Field>
                  </CommandForm>
                ) : null}
                <div className="payroll-lines">
                  {period.lines.map((line) => (
                    <div key={line.id}>
                      <p>
                        <span>
                          {line.employeeCode} · {line.employeeName}
                        </span>
                        <strong>
                          {money(line.netAmount, period.currency)}
                        </strong>
                        <small>
                          {line.paymentStatus === "PAID"
                            ? "Đã liên kết đủ khoản chi"
                            : line.paymentStatus === "PARTIALLY_PAID"
                              ? `Đã liên kết ${money(line.paidAmount, period.currency)}`
                              : "Chưa liên kết khoản chi"}
                        </small>
                      </p>
                      {period.status === "CLOSED" &&
                      canClosePayroll &&
                      data.payments.length ? (
                        <details className="compensation-command">
                          <summary>Liên kết khoản chi</summary>
                          <CommandForm
                            consequence="Đây chỉ là liên kết đối soát; không tạo hoặc đăng sổ tiền lần nữa."
                            idempotencyKey={initialKeys[`payment:${line.id}`]}
                            kind="payroll.payment.link"
                            label="LIÊN KẾT KHOẢN CHI"
                          >
                            <input
                              name="payrollLineId"
                              type="hidden"
                              value={line.id}
                            />
                            <Field label="Khoản chi đã đăng sổ">
                              <select name="paymentId">
                                {data.payments.map((payment) => (
                                  <option key={payment.id} value={payment.id}>
                                    {payment.number} · còn{" "}
                                    {money(
                                      payment.availableAmount,
                                      payment.currency,
                                    )}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field label="Số tiền liên kết">
                              <input
                                name="amount"
                                inputMode="decimal"
                                placeholder="5000000"
                                required
                              />
                            </Field>
                            <Field label="Ghi chú liên kết">
                              <textarea
                                name="note"
                                placeholder="Nêu đợt chi hoặc chứng từ đối soát"
                                required
                              />
                            </Field>
                          </CommandForm>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
