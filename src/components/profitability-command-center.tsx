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
import { useActionState, useMemo, useState, type ReactNode } from "react";

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

function CommandForm({
  children,
  idempotencyKey,
  kind,
  label,
  tone = "primary",
}: {
  children: ReactNode;
  idempotencyKey: string;
  kind:
    | "profitability.cost.record"
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
  return (
    <form action={action} className="profitability-command-form">
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <button
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
        {pending ? "ĐANG GHI…" : label}
      </button>
      {state.status !== "idle" ? (
        <p
          aria-live="polite"
          className={`form-message form-message-${state.status}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
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
  const [dimension, setDimension] =
    useState<ProfitabilityDimensionSummary["dimension"]>("CUSTOMER");
  const [query, setQuery] = useState("");
  const orders = useMemo(
    () =>
      data.orders.filter(
        (order) =>
          (lifecycle === "ALL" || order.lifecycle === lifecycle) &&
          `${order.salesOrderNumber} ${order.customerName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [data.orders, lifecycle, query],
  );
  const dimensions = data.dimensions
    .filter((item) => item.dimension === dimension)
    .slice(0, 6);
  const actualCosts = data.costWaterfall.filter(
    (item) => item.basis === "ACTUAL",
  );
  const maxCost = Math.max(
    ...actualCosts.map((item) => Number(item.amount)),
    1,
  );
  const keyFor = (name: string) => initialKeys[name] ?? `profitability-${name}`;
  const center = data.commandCenter;

  return (
    <div className="profitability-workspace">
      <header className="profitability-header">
        <div>
          <p className="page-context">P9 · Profitability & Command Center</p>
          <h1>Trung tâm điều hành lợi nhuận</h1>
          <p>
            Đọc biên đóng góp từ doanh thu đến chi phí trực tiếp — không phân bổ
            giả định chi phí chung.
          </p>
        </div>
        <div className="profitability-as-of">
          <CheckCircle2 aria-hidden="true" />
          <span>
            Dữ liệu đến ngày<strong>{center.asOfDate}</strong>
          </span>
        </div>
      </header>

      <section aria-label="Chỉ số điều hành" className="profitability-kpis">
        <article>
          <CircleDollarSign />
          <span>Doanh thu hiệu lực</span>
          <strong>{money(center.revenue)}</strong>
          <small>Báo giá → cam kết → thực tế</small>
        </article>
        <article>
          <TrendingUp />
          <span>Lợi nhuận đóng góp</span>
          <strong>{money(center.contributionProfit)}</strong>
          <small className="kpi-positive">
            {percent(center.actualMarginPercent)} biên hiện tại
          </small>
        </article>
        <article>
          <WalletCards />
          <span>Vốn lưu động</span>
          <strong>{money(center.workingCapital)}</strong>
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
              <p>Waterfall chi phí trực tiếp</p>
              <h2>Chi phí thực tế theo cấu phần</h2>
            </div>
            <span>Không gồm overhead chung</span>
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
                <strong>{money(item.amount)}</strong>
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
                <strong>ESTIMATED</strong>
                <small>Báo giá và chi phí tham chiếu</small>
              </div>
              <b>{center.estimatedCount}</b>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>ACTUAL_OPEN</strong>
                <small>Đang nhận doanh thu, chi phí thực tế</small>
              </div>
              <b>{center.actualOpenCount}</b>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>FINALIZED</strong>
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
            <p>Expected vs actual</p>
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
                <th>Doanh thu hiệu lực</th>
                <th>Chi phí trực tiếp</th>
                <th>Lợi nhuận đóng góp</th>
                <th>Biên / chênh lệch</th>
                <th>Vòng đời</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const hasActual = Number(order.actualRevenue) > 0;
                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.salesOrderNumber}</strong>
                      <span>{order.customerName}</span>
                      <small>
                        {order.primaryMaterial} · {order.primarySupplier} ·{" "}
                        {order.vehiclePlate}
                      </small>
                    </td>
                    <td>
                      <strong>
                        {money(
                          hasActual
                            ? order.actualRevenue
                            : order.committedRevenue,
                          order.currency,
                        )}
                      </strong>
                      <small>{hasActual ? "Thực tế" : "Cam kết"}</small>
                    </td>
                    <td>
                      <strong>
                        {money(
                          hasActual
                            ? order.actualDirectCost
                            : order.committedDirectCost,
                          order.currency,
                        )}
                      </strong>
                      <small>Chi phí trực tiếp</small>
                    </td>
                    <td>
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
                        {money(order.quotedContributionProfit, order.currency)}
                      </small>
                    </td>
                    <td>
                      <MarginCell order={order} />
                    </td>
                    <td>
                      <span
                        className={`profitability-status status-${order.lifecycle.toLowerCase()}`}
                      >
                        {lifecycleLabel[order.lifecycle]}
                      </span>
                    </td>
                    <td>
                      {canManage ? (
                        <details className="profitability-order-actions">
                          <summary>Thao tác</summary>
                          <div>
                            {order.lifecycle !== "FINALIZED" ? (
                              <>
                                <CommandForm
                                  idempotencyKey={keyFor(`cost:${order.id}`)}
                                  kind="profitability.cost.record"
                                  label="GHI CHI PHÍ"
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
                                  <CommandForm
                                    idempotencyKey={keyFor(
                                      `finalize:${order.id}`,
                                    )}
                                    kind="profitability.finalize"
                                    label="CHỐT LỢI NHUẬN"
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
                                ) : null}
                              </>
                            ) : (
                              <CommandForm
                                idempotencyKey={keyFor(`reopen:${order.id}`)}
                                kind="profitability.reopen"
                                label="MỞ LẠI CÓ KIỂM SOÁT"
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
            </tbody>
          </table>
        </div>
      </section>

      <section className="profitability-bottom-grid">
        <article className="profitability-dimensions">
          <div className="profitability-section-heading">
            <div>
              <p>Drill-down lợi nhuận</p>
              <h2>Xem theo chiều phân tích</h2>
            </div>
          </div>
          <div
            className="dimension-tabs"
            role="tablist"
            aria-label="Chiều phân tích"
          >
            {(
              [
                "CUSTOMER",
                "MATERIAL",
                "SUPPLIER",
                "VEHICLE",
                "SERVICE",
              ] as const
            ).map((item) => (
              <button
                aria-selected={dimension === item}
                key={item}
                onClick={() => setDimension(item)}
                role="tab"
                type="button"
              >
                {dimensionLabels[item]}
              </button>
            ))}
          </div>
          <div className="dimension-list">
            {dimensions.map((item) => (
              <div key={`${item.dimension}-${item.dimensionId}`}>
                <span>
                  <strong>{item.dimensionName}</strong>
                  <small>
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
            {money(center.workingCapital)}
          </strong>
          <div>
            <span>
              <WalletCards />
              Tiền hiện có
            </span>
            <b>{money(center.cashBalance)}</b>
          </div>
          <div>
            <span>
              <BanknoteArrowDown />
              Phải thu
            </span>
            <b>{money(center.receivables)}</b>
          </div>
          <div>
            <span>
              <BanknoteArrowUp />
              Phải trả
            </span>
            <b>− {money(center.payables)}</b>
          </div>
          <Link className="secondary-button button-link" href="/app/finance">
            Mở sổ tài chính
          </Link>
        </article>
      </section>

      <aside className="profitability-policy-note">
        <RefreshCcw aria-hidden="true" />
        <div>
          <strong>Chi phí đến muộn sau FINALIZED</strong>
          <p>
            Không sửa âm thầm số đã chốt. Finance phải mở lại với lý do, ghi chi
            phí có nguồn và chốt lại; mọi chuyển trạng thái đều được giữ trong
            lịch sử.
          </p>
        </div>
      </aside>
    </div>
  );
}
