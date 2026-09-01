"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BanknoteArrowDown,
  BanknoteArrowUp,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  LockKeyhole,
  RefreshCcw,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  runProfitabilityAction,
  type ProfitabilityActionState,
} from "@/app/app/actions";
import type {
  DirectCostCategory,
  OrderProfitabilitySummary,
  ProfitabilityDimensionSummary,
  ProfitabilitySnapshot,
} from "@/modules/profitability/types";

const money = (value: string, currency = "VND") =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
const percent = (value: string | null) =>
  value === null ? "—" : `${Number(value).toFixed(1)}%`;
const lifecycleLabel = {
  ESTIMATED: "Ước tính",
  ACTUAL_OPEN: "Thực tế đang mở",
  FINALIZED: "Đã chốt",
} as const;
const costLabels: Record<DirectCostCategory, string> = {
  MATERIAL: "Vật liệu",
  TRANSPORT: "Vận chuyển",
  LOADING: "Bốc xếp",
  FUEL: "Nhiên liệu",
  DIRECT_LABOR: "Nhân công trực tiếp",
  OTHER_DIRECT: "Trực tiếp khác",
};
const dimensionLabels: Record<
  ProfitabilityDimensionSummary["dimension"],
  string
> = {
  ORDER: "Đơn hàng",
  CUSTOMER: "Khách hàng",
  MATERIAL: "Vật liệu",
  SUPPLIER: "Nhà cung cấp",
  VEHICLE: "Phương tiện",
  SERVICE: "Dịch vụ",
};
const dimensionOptions = [
  "CUSTOMER",
  "MATERIAL",
  "SUPPLIER",
  "VEHICLE",
  "SERVICE",
] as const;
type DrilldownDimension = (typeof dimensionOptions)[number];

function CommandForm({
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
  kind:
    | "profitability.cost.record"
    | "profitability.revenue.allocate"
    | "profitability.finalize"
    | "profitability.reopen";
  label: string;
  tone?: "primary" | "secondary" | "risk";
}) {
  const initial: ProfitabilityActionState = {
    status: "idle",
    message: "",
    idempotencyKey,
  };
  const [state, action, pending] = useActionState(
    runProfitabilityAction,
    initial,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submittedDraft = useRef<Array<[string, string]>>([]);

  useEffect(() => {
    if (state.status !== "error" || !formRef.current) return;
    for (const [name, value] of submittedDraft.current) {
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

  return (
    <form
      ref={formRef}
      action={action}
      className="profitability-command-form"
      onSubmit={(event) => {
        submittedDraft.current = Array.from(
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
        <p className="profitability-consequence">{description}</p>
      ) : null}
      <button
        aria-busy={pending}
        className={
          tone === "primary"
            ? "primary-button"
            : tone === "risk"
              ? "profitability-risk-button"
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

function LifecycleBadge({
  lifecycle,
}: {
  lifecycle: OrderProfitabilitySummary["lifecycle"];
}) {
  const Icon =
    lifecycle === "FINALIZED"
      ? LockKeyhole
      : lifecycle === "ACTUAL_OPEN"
        ? RefreshCcw
        : TrendingUp;
  return (
    <span className={`profitability-status status-${lifecycle.toLowerCase()}`}>
      <Icon aria-hidden="true" />
      {lifecycleLabel[lifecycle]}
    </span>
  );
}

function MarginCell({ order }: { order: OrderProfitabilitySummary }) {
  const variance = Number(order.marginVariancePoints ?? 0);
  return (
    <div className="profitability-margin-cell">
      <strong>
        {percent(order.actualMarginPercent ?? order.committedMarginPercent)}
      </strong>
      {order.marginVariancePoints !== null ? (
        <span
          className={variance < 0 ? "variance-negative" : "variance-positive"}
        >
          {variance < 0 ? (
            <ArrowDownRight aria-hidden="true" />
          ) : (
            <ArrowUpRight aria-hidden="true" />
          )}
          {Math.abs(variance).toFixed(1)} điểm
        </span>
      ) : (
        <span>Chưa có thực tế</span>
      )}
    </div>
  );
}

export function ProfitabilityCommandCenter({
  data,
  initialKeys,
  canManage,
}: {
  data: ProfitabilitySnapshot;
  initialKeys: Record<string, string>;
  canManage: boolean;
}) {
  const [lifecycle, setLifecycle] = useState("ALL");
  const [dimension, setDimension] = useState<DrilldownDimension>("CUSTOMER");
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState(
    data.commandCenters[0]?.currency ?? "VND",
  );
  const orders = useMemo(
    () =>
      data.orders.filter(
        (order) =>
          (lifecycle === "ALL" || order.lifecycle === lifecycle) &&
          order.currency === currency &&
          `${order.salesOrderNumber} ${order.customerName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [currency, data.orders, lifecycle, query],
  );
  const dimensions = data.dimensions
    .filter(
      (item) => item.dimension === dimension && item.currency === currency,
    )
    .slice(0, 6);
  const actualCosts = data.costWaterfall.filter(
    (item) => item.basis === "ACTUAL" && item.currency === currency,
  );
  const maxCost = Math.max(
    ...actualCosts.map((item) => Number(item.amount)),
    1,
  );
  const keyFor = (name: string) => initialKeys[name] ?? `profitability-${name}`;
  const center =
    data.commandCenters.find((item) => item.currency === currency) ??
    data.commandCenters[0];
  if (!center) return null;

  function moveDimensionTab(
    event: KeyboardEvent<HTMLButtonElement>,
    current: DrilldownDimension,
  ) {
    const currentIndex = dimensionOptions.indexOf(current);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % dimensionOptions.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + dimensionOptions.length) % dimensionOptions.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = dimensionOptions.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextDimension = dimensionOptions[nextIndex];
    if (!nextDimension) return;
    setDimension(nextDimension);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`#dimension-tab-${nextDimension}`)
      ?.focus();
  }

  return (
    <div className="profitability-workspace">
      <header className="profitability-header">
        <div>
          <p className="page-context">P9 · Lợi nhuận và điều hành</p>
          <h1>Trung tâm điều hành lợi nhuận</h1>
          <p>
            Theo dõi doanh thu, chi phí trực tiếp và phần lợi nhuận còn lại mà
            không phân bổ giả định chi phí chung.
          </p>
        </div>
        <div className="profitability-as-of">
          <CheckCircle2 aria-hidden="true" />
          <span>
            Dữ liệu đến ngày<strong>{center.asOfDate}</strong>
          </span>
          <label>
            <span>Tiền tệ</span>
            <select
              onChange={(event) => setCurrency(event.target.value)}
              value={currency}
            >
              {data.commandCenters.map((item) => (
                <option key={item.currency} value={item.currency}>
                  {item.currency}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section aria-label="Chỉ số điều hành" className="profitability-kpis">
        <article>
          <CircleDollarSign />
          <span>Doanh thu hiệu lực</span>
          <strong>{money(center.revenue, center.currency)}</strong>
          <small>Báo giá → cam kết → thực tế</small>
        </article>
        <article>
          <TrendingUp />
          <span>Lợi nhuận đóng góp</span>
          <strong>{money(center.contributionProfit, center.currency)}</strong>
          <small className="kpi-positive">
            {percent(center.actualMarginPercent)} biên hiện tại
          </small>
        </article>
        <article>
          <WalletCards />
          <span>Vốn lưu động</span>
          <strong>{money(center.workingCapital, center.currency)}</strong>
          <small>Tiền + phải thu − phải trả</small>
        </article>
        <article>
          <LockKeyhole />
          <span>Vòng đời lợi nhuận</span>
          <strong>{center.actualOpenCount} đang mở</strong>
          <small>
            {center.finalizedCount} đã chốt · {center.estimatedCount} ước tính
          </small>
        </article>
      </section>

      <section className="profitability-analysis-grid">
        <article className="profitability-waterfall">
          <div className="profitability-section-heading">
            <div>
              <p>Cơ cấu chi phí trực tiếp</p>
              <h2>Chi phí thực tế theo cấu phần</h2>
            </div>
            <span>Không gồm chi phí chung</span>
          </div>
          <div className="cost-bars">
            {actualCosts.map((item) => (
              <div
                className="cost-bar-row"
                key={`${item.basis}-${item.category}`}
              >
                <span>{costLabels[item.category]}</span>
                <div>
                  <i
                    style={{
                      width: `${Math.max(4, (Number(item.amount) / maxCost) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{money(item.amount, item.currency)}</strong>
              </div>
            ))}
            {!actualCosts.length ? (
              <p className="profitability-empty">
                Chưa có chi phí thực tế để tạo waterfall.
              </p>
            ) : null}
          </div>
        </article>

        <article className="profitability-lifecycle-panel">
          <div className="profitability-section-heading">
            <div>
              <p>Kiểm soát vòng đời</p>
              <h2>Ước tính đến chốt sổ</h2>
            </div>
          </div>
          <ol className="profitability-lifecycle-rail">
            <li>
              <span>1</span>
              <div>
                <strong>Ước tính</strong>
                <small>Báo giá và chi phí tham chiếu</small>
              </div>
              <b>{center.estimatedCount}</b>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Đang ghi nhận thực tế</strong>
                <small>Đang nhận doanh thu, chi phí thực tế</small>
              </div>
              <b>{center.actualOpenCount}</b>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Đã chốt</strong>
                <small>Chi phí muộn phải mở lại có lý do</small>
              </div>
              <b>{center.finalizedCount}</b>
            </li>
          </ol>
        </article>
      </section>

      <section className="profitability-orders-panel">
        <div className="profitability-section-heading">
          <div>
            <p>Kế hoạch so với thực tế</p>
            <h2>Biên lợi nhuận theo đơn hàng</h2>
          </div>
          <span>{orders.length} đơn phù hợp</span>
        </div>
        <div className="profitability-filters">
          <label>
            <span>Tìm đơn hoặc khách hàng</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SO-2026…"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span>Vòng đời</span>
            <select
              onChange={(event) => setLifecycle(event.target.value)}
              value={lifecycle}
            >
              <option value="ALL">Tất cả vòng đời</option>
              <option value="ESTIMATED">Ước tính</option>
              <option value="ACTUAL_OPEN">Thực tế đang mở</option>
              <option value="FINALIZED">Đã chốt</option>
            </select>
          </label>
        </div>
        <div className="profitability-table-wrap">
          <table className="profitability-table">
            <thead>
              <tr>
                <th>Đơn hàng / khách hàng</th>
                <th>Kết quả tài chính</th>
                <th>Biên lợi nhuận</th>
                <th>Trạng thái</th>
                <th aria-label="Cập nhật đơn" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const hasActual = Number(order.actualRevenue) > 0;
                return (
                  <tr key={order.id}>
                    <td data-label="Đơn hàng">
                      <strong>{order.salesOrderNumber}</strong>
                      <span>{order.customerName}</span>
                      <small>
                        {order.primaryMaterial} · {order.primarySupplier} ·{" "}
                        {order.vehiclePlate}
                      </small>
                    </td>
                    <td
                      className="profitability-financial-cell"
                      data-label="Kết quả tài chính"
                    >
                      <span>
                        <small>
                          Doanh thu {hasActual ? "thực tế" : "cam kết"}
                        </small>
                        <strong>
                          {money(
                            hasActual
                              ? order.actualRevenue
                              : order.committedRevenue,
                            order.currency,
                          )}
                        </strong>
                      </span>
                      <span>
                        <small>Chi phí trực tiếp</small>
                        <strong>
                          {money(
                            hasActual
                              ? order.actualDirectCost
                              : order.committedDirectCost,
                            order.currency,
                          )}
                        </strong>
                      </span>
                      <span>
                        <small>Lợi nhuận còn lại</small>
                        <strong>
                          {money(
                            hasActual
                              ? order.actualContributionProfit
                              : order.committedContributionProfit,
                            order.currency,
                          )}
                        </strong>
                        <small>
                          Báo giá{" "}
                          {money(
                            order.quotedContributionProfit,
                            order.currency,
                          )}
                        </small>
                      </span>
                    </td>
                    <td data-label="Biên lợi nhuận">
                      <MarginCell order={order} />
                    </td>
                    <td data-label="Trạng thái">
                      <LifecycleBadge lifecycle={order.lifecycle} />
                    </td>
                    <td data-label="Cập nhật đơn">
                      {canManage ? (
                        <details className="profitability-order-actions">
                          <summary>Cập nhật đơn</summary>
                          <div>
                            {order.lifecycle !== "FINALIZED" ? (
                              <>
                                <CommandForm
                                  idempotencyKey={keyFor(`cost:${order.id}`)}
                                  kind="profitability.cost.record"
                                  label="Ghi chi phí"
                                  tone="secondary"
                                >
                                  <input
                                    name="salesOrderId"
                                    type="hidden"
                                    value={order.salesOrderId}
                                  />
                                  <label>
                                    <span>Cơ sở</span>
                                    <select name="basis">
                                      <option value="ACTUAL">Thực tế</option>
                                      <option value="COMMITTED">Cam kết</option>
                                      <option value="QUOTED">Báo giá</option>
                                    </select>
                                  </label>
                                  <label>
                                    <span>Nhóm chi phí</span>
                                    <select name="category">
                                      {Object.entries(costLabels).map(
                                        ([key, label]) => (
                                          <option key={key} value={key}>
                                            {label}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                  </label>
                                  <label>
                                    <span>Số tiền</span>
                                    <input
                                      min="1"
                                      name="amount"
                                      required
                                      step="1"
                                      type="number"
                                    />
                                  </label>
                                  <label>
                                    <span>Thời điểm</span>
                                    <input
                                      defaultValue={`${center.asOfDate}T09:00`}
                                      name="occurredAt"
                                      required
                                      type="datetime-local"
                                    />
                                  </label>
                                  <label>
                                    <span>Lý do</span>
                                    <textarea
                                      name="reason"
                                      placeholder="Nêu nguồn và lý do ghi nhận…"
                                      required
                                    />
                                  </label>
                                </CommandForm>
                                {order.lifecycle === "ACTUAL_OPEN" ? (
                                  <>
                                    <CommandForm
                                      idempotencyKey={keyFor(
                                        `revenue:${order.id}`,
                                      )}
                                      kind="profitability.revenue.allocate"
                                      label="Ghi doanh thu dịch vụ"
                                      tone="secondary"
                                    >
                                      <input
                                        name="salesOrderId"
                                        type="hidden"
                                        value={order.salesOrderId}
                                      />
                                      <label>
                                        <span>Mã dịch vụ</span>
                                        <input
                                          name="serviceReferenceId"
                                          required
                                        />
                                      </label>
                                      <label>
                                        <span>Doanh thu phân bổ</span>
                                        <input
                                          min="1"
                                          name="amount"
                                          required
                                          step="1"
                                          type="number"
                                        />
                                      </label>
                                      <label>
                                        <span>Lý do và nguồn doanh thu</span>
                                        <textarea name="reason" required />
                                      </label>
                                    </CommandForm>
                                    <CommandForm
                                      idempotencyKey={keyFor(
                                        `finalize:${order.id}`,
                                      )}
                                      kind="profitability.finalize"
                                      description="Sau khi chốt, chi phí đến muộn chỉ được ghi khi mở lại và nêu rõ lý do."
                                      label="Chốt lợi nhuận"
                                    >
                                      <input
                                        name="salesOrderId"
                                        type="hidden"
                                        value={order.salesOrderId}
                                      />
                                      <label>
                                        <span>Lý do chốt</span>
                                        <textarea
                                          name="reason"
                                          placeholder="Đã đối chiếu đủ chứng từ trực tiếp…"
                                          required
                                        />
                                      </label>
                                    </CommandForm>
                                  </>
                                ) : null}
                              </>
                            ) : (
                              <CommandForm
                                idempotencyKey={keyFor(`reopen:${order.id}`)}
                                kind="profitability.reopen"
                                description="Mở lại cho phép ghi chi phí đến muộn; lý do và lần mở lại được lưu trong lịch sử."
                                label="Mở lại lợi nhuận"
                                tone="risk"
                              >
                                <input
                                  name="salesOrderId"
                                  type="hidden"
                                  value={order.salesOrderId}
                                />
                                <label>
                                  <span>Lý do mở lại</span>
                                  <textarea
                                    name="reason"
                                    placeholder="Chi phí đến muộn theo chứng từ…"
                                    required
                                  />
                                </label>
                              </CommandForm>
                            )}
                          </div>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!orders.length ? (
                <tr>
                  <td className="profitability-empty-row" colSpan={5}>
                    Không có đơn hàng phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="profitability-bottom-grid">
        <article className="profitability-dimensions">
          <div className="profitability-section-heading">
            <div>
              <p>Chi tiết lợi nhuận</p>
              <h2>Xem theo chiều phân tích</h2>
            </div>
          </div>
          <div
            className="dimension-tabs"
            role="tablist"
            aria-label="Chiều phân tích"
          >
            {dimensionOptions.map((item) => (
              <button
                aria-controls="profitability-dimension-panel"
                aria-selected={dimension === item}
                id={`dimension-tab-${item}`}
                key={item}
                onClick={() => setDimension(item)}
                onKeyDown={(event) => moveDimensionTab(event, item)}
                role="tab"
                tabIndex={dimension === item ? 0 : -1}
                type="button"
              >
                {dimensionLabels[item]}
              </button>
            ))}
          </div>
          <div
            aria-labelledby={`dimension-tab-${dimension}`}
            className="dimension-list"
            id="profitability-dimension-panel"
            role="tabpanel"
            tabIndex={0}
          >
            {dimensions.map((item) => (
              <div key={`${item.dimension}-${item.dimensionId}`}>
                <span>
                  <strong>{item.dimensionName}</strong>
                  <small>
                    {money(item.revenue, item.currency)} doanh thu ·{" "}
                    {money(item.directCost, item.currency)} chi phí trực tiếp
                  </small>
                </span>
                <b
                  className={
                    Number(item.contributionProfit) >= 0
                      ? "kpi-positive"
                      : "variance-negative"
                  }
                >
                  {money(item.contributionProfit, item.currency)}
                </b>
              </div>
            ))}
            {!dimensions.length ? (
              <p className="profitability-empty">
                Chưa có dữ liệu cho chiều phân tích này.
              </p>
            ) : null}
          </div>
        </article>
        <article className="working-capital-card">
          <div className="profitability-section-heading">
            <div>
              <p>Khả năng tài trợ vận hành</p>
              <h2>Vốn lưu động</h2>
            </div>
            <Landmark />
          </div>
          <strong className="working-capital-total">
            {money(center.workingCapital, center.currency)}
          </strong>
          <div>
            <span>
              <WalletCards />
              Tiền hiện có
            </span>
            <b>{money(center.cashBalance, center.currency)}</b>
          </div>
          <div>
            <span>
              <BanknoteArrowDown />
              Phải thu
            </span>
            <b>{money(center.receivables, center.currency)}</b>
          </div>
          <div>
            <span>
              <BanknoteArrowUp />
              Phải trả
            </span>
            <b>− {money(center.payables, center.currency)}</b>
          </div>
          <Link className="secondary-button button-link" href="/app/finance">
            Mở sổ tài chính
          </Link>
        </article>
      </section>

      <aside className="profitability-policy-note">
        <RefreshCcw aria-hidden="true" />
        <div>
          <strong>Chi phí đến muộn sau khi đã chốt</strong>
          <p>
            Không sửa âm thầm số đã chốt. Bộ phận Tài chính phải mở lại với lý
            do, ghi chi phí có nguồn và chốt lại; mọi chuyển trạng thái đều được
            giữ trong lịch sử.
          </p>
        </div>
      </aside>
    </div>
  );
}
