"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  BadgeCheck,
  Calculator,
  CheckCheck,
  ClipboardList,
  FileCheck2,
  FileClock,
  FilePlus2,
  History,
  LockKeyhole,
  PackageCheck,
  RefreshCw,
  Send,
  ShieldAlert,
  ShoppingCart,
  Truck,
} from "lucide-react";
import Link from "next/link";

import {
  runCommercialAction,
  type CommercialActionState,
} from "@/app/app/sales/orders/actions";
import { evaluateCustomerCredit } from "@/modules/customer-360/credit";
import type {
  CommercialCommandKind,
  CommercialSnapshot,
} from "@/modules/commercial/types";

type WorkspaceTab = "quotations" | "orders" | "fulfillment";

const QUOTE_STATUS_LABELS = {
  DRAFT: "Bản nháp",
  SENT: "Đã gửi",
  ACCEPTED: "Đã chấp nhận",
  REJECTED: "Bị từ chối",
  EXPIRED: "Hết hiệu lực",
  CANCELLED: "Đã hủy",
} as const;

const ORDER_STATUS_LABELS = {
  DRAFT: "Bản nháp",
  CREDIT_BLOCKED: "Chặn tín dụng",
  CONFIRMED: "Đã xác nhận",
  FULFILLING: "Đang thực hiện",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
} as const;

function formatMoney(value: string, currency = "VND") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} ${currency}`;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(numeric);
}

function SubmitButton({
  label,
  icon,
  tone = "primary",
}: {
  label: string;
  icon: ReactNode;
  tone?: "primary" | "secondary" | "risk";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={
        tone === "primary"
          ? "primary-button commercial-submit"
          : tone === "risk"
            ? "commercial-risk-button commercial-submit"
            : "secondary-button commercial-submit"
      }
      disabled={pending}
      type="submit"
    >
      {icon}
      {pending ? "Đang xử lý…" : label}
    </button>
  );
}

function CommandForm({
  kind,
  initialKey,
  children,
  label,
  icon,
  tone,
  className = "commercial-inline-form",
}: {
  kind: CommercialCommandKind;
  initialKey: string;
  children?: ReactNode;
  label: string;
  icon: ReactNode;
  tone?: "primary" | "secondary" | "risk";
  className?: string;
}) {
  const initialState: CommercialActionState = {
    status: "idle",
    message: "",
    idempotencyKey: initialKey,
  };
  const [state, action] = useActionState(runCommercialAction, initialState);
  return (
    <form action={action} className={className}>
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <SubmitButton icon={icon} label={label} tone={tone} />
      {state.message ? (
        <p
          aria-live="polite"
          className={
            state.status === "error" ? "form-error compact" : "form-success"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "master-field master-field-wide" : "master-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function statusClass(status: string) {
  return `commercial-status status-${status.toLowerCase().replaceAll("_", "-")}`;
}

export function CommercialWorkspace({
  data,
  initialKeys,
  today,
  canCreateQuotation,
  canSendQuotation,
  canAcceptQuotation,
  canCreateOrder,
  canConfirmOrder,
  canOverridePrice,
  canOverrideCredit,
}: {
  data: CommercialSnapshot;
  initialKeys: Record<string, string>;
  today: string;
  canCreateQuotation: boolean;
  canSendQuotation: boolean;
  canAcceptQuotation: boolean;
  canCreateOrder: boolean;
  canConfirmOrder: boolean;
  canOverridePrice: boolean;
  canOverrideCredit: boolean;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("quotations");
  const [quotationId, setQuotationId] = useState(data.quotations[0]?.id ?? "");
  const [formCustomerId, setFormCustomerId] = useState(
    data.customers[0]?.id ?? "",
  );

  const quotation =
    data.quotations.find((item) => item.id === quotationId) ??
    data.quotations[0];
  const revision = data.revisions.find(
    (item) => item.id === quotation?.activeRevisionId,
  );
  const lines = data.quotationLines.filter(
    (item) => item.revisionId === revision?.id,
  );
  const revisionHistory = data.revisions
    .filter((item) => item.quotationId === quotation?.id)
    .sort((left, right) => right.revisionNumber - left.revisionNumber);
  const availableSites = data.sites.filter(
    (site) => site.customerId === formCustomerId && site.isActive,
  );

  const draftOrders = data.salesOrders.filter((item) =>
    ["DRAFT", "CREDIT_BLOCKED"].includes(item.status),
  ).length;
  const confirmedOrders = data.salesOrders.filter((item) =>
    ["CONFIRMED", "FULFILLING", "COMPLETED"].includes(item.status),
  ).length;
  const lockedRevisions = data.revisions.filter(
    (item) => item.status !== "DRAFT",
  ).length;

  return (
    <div className="commercial-workspace">
      <header className="master-page-header commercial-page-header">
        <div>
          <p className="page-context">Bán hàng · Giao dịch</p>
          <h1>Báo giá & đơn bán</h1>
          <p>
            Lập báo giá có phiên bản, khóa đúng giá đã gửi và xác nhận đơn qua
            kiểm tra tín dụng.
          </p>
        </div>
        <Link className="secondary-button button-link" href="/app/sales">
          Hồ sơ khách hàng & giá
        </Link>
      </header>

      <section className="master-metrics" aria-label="Tóm tắt giao dịch bán">
        <div>
          <strong>{data.quotations.length}</strong>
          <span>Báo giá</span>
        </div>
        <div>
          <strong>{lockedRevisions}</strong>
          <span>Phiên bản đã khóa</span>
        </div>
        <div>
          <strong>{draftOrders}</strong>
          <span>Đơn chờ xác nhận</span>
        </div>
        <div>
          <strong>{confirmedOrders}</strong>
          <span>Đơn đã xác nhận</span>
        </div>
      </section>

      <div
        className="master-tabs commercial-tabs"
        role="tablist"
        aria-label="Nội dung giao dịch bán"
      >
        <button
          aria-selected={tab === "quotations"}
          onClick={() => setTab("quotations")}
          role="tab"
          type="button"
        >
          <FileClock aria-hidden="true" size={20} /> Báo giá
        </button>
        <button
          aria-selected={tab === "orders"}
          onClick={() => setTab("orders")}
          role="tab"
          type="button"
        >
          <ShoppingCart aria-hidden="true" size={20} /> Đơn bán
        </button>
        <button
          aria-selected={tab === "fulfillment"}
          onClick={() => setTab("fulfillment")}
          role="tab"
          type="button"
        >
          <Truck aria-hidden="true" size={20} /> Yêu cầu thực hiện
        </button>
      </div>

      {tab === "quotations" ? (
        <div className="commercial-panel" role="tabpanel">
          <section className="commercial-selector" aria-label="Chọn báo giá">
            <label>
              <span>Báo giá đang xem</span>
              <select
                aria-label="Báo giá đang xem"
                onChange={(event) => setQuotationId(event.target.value)}
                value={quotation?.id ?? ""}
              >
                {data.quotations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.quotationNumber} · {item.customerName}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {quotation && revision ? (
            <section
              className="quote-detail-card"
              aria-labelledby="quote-detail-title"
            >
              <div className="quote-detail-heading">
                <div>
                  <span className={statusClass(revision.status)}>
                    {QUOTE_STATUS_LABELS[quotation.status]}
                  </span>
                  <h2 id="quote-detail-title">{quotation.quotationNumber}</h2>
                  <p>
                    {quotation.customerName} ·{" "}
                    {quotation.customerSiteName ?? "Chưa chọn địa điểm"}
                  </p>
                </div>
                <div className="quote-total">
                  <small>Tổng báo giá</small>
                  <strong>
                    {formatMoney(revision.totalAmount, revision.currency)}
                  </strong>
                  <span>
                    Hiệu lực đến{" "}
                    {new Date(revision.validUntil).toLocaleDateString("vi-VN")}
                  </span>
                </div>
              </div>

              <div className="revision-lock-note">
                <LockKeyhole aria-hidden="true" size={20} />
                <span>
                  Phiên bản {revision.revisionNumber} ·{" "}
                  {revision.status === "DRAFT"
                    ? "Có thể sửa và làm mới giá trước khi gửi."
                    : "Đã khóa: giá, số lượng và đơn vị tính không thể sửa."}
                </span>
              </div>

              <div
                aria-label="Bảng dòng báo giá, có thể cuộn ngang"
                className="master-table-wrap quote-line-table"
                role="region"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Vật liệu</th>
                      <th>Số lượng</th>
                      <th>Đơn giá đã chụp</th>
                      <th>Thành tiền</th>
                      <th>Kiểm soát giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length ? (
                      lines.map((line) => (
                        <tr key={line.id}>
                          <td>
                            {line.materialName}
                            <small>{line.materialCode}</small>
                          </td>
                          <td>
                            {line.quantity} {line.uomSymbol}
                          </td>
                          <td>
                            {formatMoney(line.unitPrice, line.currency)}/
                            {line.uomSymbol}
                            <small>
                              Giá tham chiếu:{" "}
                              {formatMoney(
                                line.referenceUnitPrice,
                                line.currency,
                              )}
                            </small>
                          </td>
                          <td>{formatMoney(line.lineAmount, line.currency)}</td>
                          <td>
                            <span
                              className={statusClass(line.priceSafetyStatus)}
                            >
                              {line.priceSafetyStatus === "APPROVED_OVERRIDE"
                                ? "Đã duyệt điều chỉnh"
                                : line.priceSafetyStatus === "ABOVE_RULE"
                                  ? "Trên giá quy tắc"
                                  : "Khớp quy tắc"}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="empty-table-cell" colSpan={5}>
                          Chưa có dòng vật liệu.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {revision.status === "DRAFT" && canCreateQuotation ? (
                <div className="commercial-action-grid">
                  <details className="commercial-action-card">
                    <summary>
                      <FilePlus2 aria-hidden="true" size={20} /> Thêm dòng vật
                      liệu
                    </summary>
                    <CommandForm
                      className="commercial-command-form"
                      icon={<PackageCheck aria-hidden="true" size={19} />}
                      initialKey={
                        initialKeys[`quotation.add-line:${revision.id}`]!
                      }
                      kind="quotation.add-line"
                      label="Thêm vào báo giá"
                    >
                      <input
                        name="revisionId"
                        type="hidden"
                        value={revision.id}
                      />
                      <div className="master-form-grid">
                        <Field label="Vật liệu">
                          <select name="materialId">
                            {data.materials
                              .filter((item) => item.isActive)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.code} · {item.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Số lượng">
                          <input
                            inputMode="decimal"
                            min="0.000001"
                            name="quantity"
                            required
                            step="any"
                            type="number"
                          />
                        </Field>
                        <Field label="Đơn vị tính">
                          <select name="uomId">
                            {data.uoms
                              .filter((item) => item.isActive)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} ({item.symbol})
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Đơn giá đề nghị (để trống dùng giá quy tắc)">
                          <input
                            inputMode="decimal"
                            min="0.01"
                            name="requestedUnitPrice"
                            step="0.01"
                            type="number"
                          />
                        </Field>
                        <Field label="Lý do điều chỉnh giá" wide>
                          <input
                            disabled={!canOverridePrice}
                            minLength={10}
                            name="priceOverrideReason"
                            placeholder={
                              canOverridePrice
                                ? "Bắt buộc nếu bán thấp hơn giá quy tắc"
                                : "Bạn không có quyền điều chỉnh giá"
                            }
                          />
                        </Field>
                      </div>
                    </CommandForm>
                  </details>

                  <div className="commercial-action-card static-action-card">
                    <RefreshCw aria-hidden="true" size={22} />
                    <h3>Làm mới giá bản nháp</h3>
                    <p>
                      Áp dụng lại giá đang hiệu lực cho tất cả dòng. Mọi điều
                      chỉnh giá cũ sẽ bị xóa khỏi bản nháp.
                    </p>
                    <CommandForm
                      icon={<RefreshCw aria-hidden="true" size={19} />}
                      initialKey={
                        initialKeys[`quotation.refresh-prices:${revision.id}`]!
                      }
                      kind="quotation.refresh-prices"
                      label="Làm mới giá"
                      tone="secondary"
                    >
                      <input
                        name="revisionId"
                        type="hidden"
                        value={revision.id}
                      />
                    </CommandForm>
                  </div>

                  {canSendQuotation ? (
                    <div className="commercial-action-card static-action-card risk-card">
                      <Send aria-hidden="true" size={22} />
                      <h3>Gửi và khóa phiên bản</h3>
                      <p>
                        Sau khi gửi, phiên bản này không thể sửa giá, số lượng
                        hoặc đơn vị tính.
                      </p>
                      <CommandForm
                        icon={<Send aria-hidden="true" size={19} />}
                        initialKey={
                          initialKeys[`quotation.send:${revision.id}`]!
                        }
                        kind="quotation.send"
                        label="Gửi báo giá"
                        tone="risk"
                      >
                        <input
                          name="revisionId"
                          type="hidden"
                          value={revision.id}
                        />
                      </CommandForm>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {revision.status === "SENT" ? (
                <div className="commercial-action-grid sent-actions">
                  {canAcceptQuotation ? (
                    <div className="commercial-action-card static-action-card">
                      <BadgeCheck aria-hidden="true" size={22} />
                      <h3>Khách đã chấp nhận</h3>
                      <p>
                        Ghi nhận đúng phiên bản khách đồng ý. Phiên bản này tiếp
                        tục được giữ nguyên.
                      </p>
                      <CommandForm
                        icon={<CheckCheck aria-hidden="true" size={19} />}
                        initialKey={
                          initialKeys[`quotation.accept:${revision.id}`]!
                        }
                        kind="quotation.accept"
                        label="Ghi nhận chấp nhận"
                      >
                        <input
                          name="revisionId"
                          type="hidden"
                          value={revision.id}
                        />
                      </CommandForm>
                    </div>
                  ) : null}
                  {canCreateQuotation ? (
                    <div className="commercial-action-card static-action-card">
                      <History aria-hidden="true" size={22} />
                      <h3>Tạo phiên bản thay thế</h3>
                      <p>
                        Bản đã gửi được giữ nguyên; hệ thống tạo một bản nháp
                        mới để chỉnh sửa.
                      </p>
                      <CommandForm
                        className="commercial-command-form compact-command-form"
                        icon={<FilePlus2 aria-hidden="true" size={19} />}
                        initialKey={
                          initialKeys[`quotation.revise:${revision.id}`]!
                        }
                        kind="quotation.revise"
                        label="Tạo phiên bản mới"
                        tone="secondary"
                      >
                        <input
                          name="revisionId"
                          type="hidden"
                          value={revision.id}
                        />
                        <Field label="Hiệu lực phiên bản mới">
                          <input
                            defaultValue={revision.validUntil}
                            min={today}
                            name="validUntil"
                            required
                            type="date"
                          />
                        </Field>
                      </CommandForm>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {revision.status === "ACCEPTED" && canCreateOrder ? (
                <section
                  className="accepted-conversion"
                  aria-label="Chuyển báo giá thành đơn bán"
                >
                  <FileCheck2 aria-hidden="true" size={28} />
                  <div>
                    <h3>Phiên bản đã được chấp nhận</h3>
                    <p>
                      Đơn bán mới sẽ sao chép nguyên giá và đơn vị tính đã chụp
                      của phiên bản này.
                    </p>
                  </div>
                  <CommandForm
                    icon={<ShoppingCart aria-hidden="true" size={19} />}
                    initialKey={
                      initialKeys[`sales-order.convert:${revision.id}`]!
                    }
                    kind="sales-order.convert"
                    label="Tạo đơn bán"
                  >
                    <input
                      name="revisionId"
                      type="hidden"
                      value={revision.id}
                    />
                  </CommandForm>
                </section>
              ) : null}

              <section
                className="revision-history"
                aria-labelledby="revision-history-title"
              >
                <h3 id="revision-history-title">Lịch sử phiên bản</h3>
                <ol>
                  {revisionHistory.map((item) => (
                    <li key={item.id}>
                      <span>Phiên bản {item.revisionNumber}</span>
                      <strong>
                        {item.status === "SUPERSEDED"
                          ? "Đã được thay thế"
                          : QUOTE_STATUS_LABELS[item.status]}
                      </strong>
                      <small>
                        {formatMoney(item.totalAmount, item.currency)} · hiệu
                        lực đến {item.validUntil}
                      </small>
                    </li>
                  ))}
                </ol>
              </section>
            </section>
          ) : (
            <p className="empty-inline">Chưa có báo giá.</p>
          )}

          {canCreateQuotation ? (
            <details className="master-form-disclosure commercial-create-disclosure">
              <summary>
                <FilePlus2 aria-hidden="true" size={20} /> Tạo báo giá mới
              </summary>
              <CommandForm
                className="master-form"
                icon={<FilePlus2 aria-hidden="true" size={19} />}
                initialKey={initialKeys["quotation.create"]!}
                kind="quotation.create"
                label="Tạo báo giá"
              >
                <div className="master-form-grid">
                  <Field label="Khách hàng">
                    <select
                      name="customerId"
                      onChange={(event) =>
                        setFormCustomerId(event.target.value)
                      }
                      value={formCustomerId}
                    >
                      {data.customers
                        .filter((item) => item.isActive)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Địa điểm giao hàng">
                    <select name="customerSiteId" defaultValue="">
                      <option value="">Chọn sau</option>
                      {availableSites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Hiệu lực đến">
                    <input
                      defaultValue={today}
                      min={today}
                      name="validUntil"
                      required
                      type="date"
                    />
                  </Field>
                  <Field label="Ghi chú" wide>
                    <input
                      name="notes"
                      placeholder="Điều kiện giao hàng hoặc ghi chú cho khách"
                    />
                  </Field>
                </div>
              </CommandForm>
            </details>
          ) : null}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="commercial-panel order-panel" role="tabpanel">
          <section
            className="critical-invariant"
            aria-label="Nguyên tắc công nợ"
          >
            <ShieldAlert aria-hidden="true" size={28} />
            <div>
              <strong>Xác nhận đơn bán không tạo công nợ khách hàng</strong>
              <span>
                Khoản phải thu chỉ phát sinh sau nghiệp vụ giao hàng hoặc tài
                chính phù hợp. Bước này chỉ tạo yêu cầu thực hiện.
              </span>
            </div>
          </section>

          <div className="order-card-list">
            {data.salesOrders.length ? (
              data.salesOrders.map((order) => {
                const orderLines = data.salesOrderLines.filter(
                  (line) => line.salesOrderId === order.id,
                );
                const exposure = data.creditExposures.find(
                  (item) => item.customerId === order.customerId,
                );
                const policy = data.creditPolicies
                  .filter(
                    (item) =>
                      item.customerId === order.customerId &&
                      item.validFrom <= today &&
                      (!item.validTo || item.validTo >= today),
                  )
                  .sort((left, right) => right.version - left.version)[0];
                const decision = exposure
                  ? evaluateCustomerCredit({
                      policy: policy ?? null,
                      exposure,
                      orderAmount: order.totalAmount,
                    })
                  : null;
                return (
                  <article className="sales-order-card" key={order.id}>
                    <div className="sales-order-heading">
                      <div>
                        <span className={statusClass(order.status)}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                        <h2>{order.salesOrderNumber}</h2>
                        <p>
                          {order.customerName} ·{" "}
                          {order.customerSiteName ?? "Chưa chọn địa điểm"}
                        </p>
                      </div>
                      <div className="quote-total">
                        <small>Tổng đơn</small>
                        <strong>
                          {formatMoney(order.totalAmount, order.currency)}
                        </strong>
                        <span>{orderLines.length} dòng vật liệu</span>
                      </div>
                    </div>
                    <div className="order-snapshot-grid">
                      <div>
                        <span>Nguồn dữ liệu đã khóa</span>
                        <strong>Phiên bản báo giá khách đã chấp nhận</strong>
                      </div>
                      <div>
                        <span>Kiểm tra tín dụng</span>
                        <strong
                          className={
                            decision?.status === "CLEAR"
                              ? "decision-clear-text"
                              : "decision-blocked-text"
                          }
                        >
                          {decision?.status === "CLEAR" ? "Đạt" : "Bị chặn"}
                        </strong>
                      </div>
                      <div>
                        <span>Yêu cầu thực hiện</span>
                        <strong>
                          {
                            data.fulfillmentRequirements.filter(
                              (item) => item.salesOrderId === order.id,
                            ).length
                          }
                        </strong>
                      </div>
                    </div>
                    <div
                      aria-label={`Dòng vật liệu của đơn ${order.salesOrderNumber}, có thể cuộn ngang`}
                      className="master-table-wrap compact-order-lines"
                      role="region"
                      tabIndex={0}
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Vật liệu</th>
                            <th>Số lượng đặt</th>
                            <th>Giá đã khóa</th>
                            <th>Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderLines.map((line) => (
                            <tr key={line.id}>
                              <td>{line.materialName}</td>
                              <td>
                                {line.orderedQuantity} {line.uomSymbol}
                              </td>
                              <td>
                                {formatMoney(line.unitPrice, line.currency)}/
                                {line.uomSymbol}
                              </td>
                              <td>
                                {formatMoney(line.lineAmount, line.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {canConfirmOrder &&
                    ["DRAFT", "CREDIT_BLOCKED"].includes(order.status) ? (
                      <CommandForm
                        className="confirm-order-form"
                        icon={<CheckCheck aria-hidden="true" size={19} />}
                        initialKey={
                          initialKeys[`sales-order.confirm:${order.id}`]!
                        }
                        kind="sales-order.confirm"
                        label="Xác nhận đơn & tạo yêu cầu thực hiện"
                        tone={
                          decision?.status === "BLOCKED" ? "risk" : "primary"
                        }
                      >
                        <input
                          name="salesOrderId"
                          type="hidden"
                          value={order.id}
                        />
                        {decision?.status === "BLOCKED" ? (
                          <div className="credit-override-box">
                            <strong>Đơn đang bị chặn tín dụng</strong>
                            {decision.reasons.map((reason) => (
                              <span key={reason}>{reason}</span>
                            ))}
                            {canOverrideCredit ? (
                              <Field label="Lý do vượt chặn (bắt buộc)">
                                <input
                                  minLength={10}
                                  name="creditOverrideReason"
                                  required
                                />
                              </Field>
                            ) : (
                              <p>
                                Bạn không có quyền vượt chặn. Hãy chuyển người
                                có thẩm quyền duyệt.
                              </p>
                            )}
                          </div>
                        ) : null}
                        <p className="confirmation-consequence">
                          Hành động này khóa đơn, tăng giá trị đơn chưa xuất hóa
                          đơn trong kiểm tra tín dụng và tạo yêu cầu thực hiện.
                          Không tạo khoản phải thu.
                        </p>
                      </CommandForm>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="empty-inline">
                Chưa có đơn bán. Hãy chuyển một báo giá đã chấp nhận.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {tab === "fulfillment" ? (
        <div className="commercial-panel" role="tabpanel">
          <section
            className="fulfillment-board"
            aria-labelledby="fulfillment-title"
          >
            <div className="section-heading compact-heading">
              <span className="section-icon" aria-hidden="true">
                <ClipboardList size={24} />
              </span>
              <div>
                <h2 id="fulfillment-title">Yêu cầu thực hiện</h2>
                <p>
                  Đơn đã xác nhận mới tạo yêu cầu. Yêu cầu chưa tự động trở
                  thành công việc có thể nhận.
                </p>
              </div>
            </div>
            <div className="fulfillment-list">
              {data.fulfillmentRequirements.length ? (
                data.fulfillmentRequirements.map((item) => {
                  const line = data.salesOrderLines.find(
                    (candidate) => candidate.id === item.salesOrderLineId,
                  );
                  const order = data.salesOrders.find(
                    (candidate) => candidate.id === item.salesOrderId,
                  );
                  return (
                    <article key={item.id}>
                      <Truck aria-hidden="true" size={24} />
                      <div>
                        <strong>
                          {order?.salesOrderNumber} · {line?.materialName}
                        </strong>
                        <span>
                          {item.requiredQuantity} {item.uomSymbol}
                        </span>
                        <small>Chờ kiểm tra nguồn hàng, kho và lịch giao</small>
                      </div>
                      <span className={statusClass(item.status)}>
                        Chờ sẵn sàng
                      </span>
                    </article>
                  );
                })
              ) : (
                <div className="empty-fulfillment">
                  <Calculator aria-hidden="true" size={34} />
                  <strong>Chưa có yêu cầu thực hiện</strong>
                  <span>Xác nhận đơn bán đầu tiên để tạo yêu cầu.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
