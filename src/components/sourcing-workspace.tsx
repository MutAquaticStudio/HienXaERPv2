"use client";
import { SnapshotPagination } from "@/components/snapshot-pagination";
import { useWorkspaceTab } from "@/components/use-workspace-tab";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import {
  BadgeCheck,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FilePlus2,
  History,
  PackageSearch,
  Route,
  Send,
  ShieldCheck,
  ShoppingBasket,
  Split,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import {
  runSourcingAction,
  type SourcingActionState,
} from "@/app/app/sourcing/actions";
import type {
  PurchaseOrderStatus,
  SourcingCommandKind,
  SourcingMode,
  SourcingSnapshot,
} from "@/modules/sourcing/types";

type WorkspaceTab = "allocations" | "orders" | "suppliers";

const MODE_LABELS: Record<SourcingMode, string> = {
  WAREHOUSE: "Lấy từ kho",
  SUPPLIER_DIRECT: "Nhà cung cấp giao thẳng",
  SUPPLIER_TO_WAREHOUSE: "Nhà cung cấp giao về kho",
};

const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT: "Bản nháp",
  CONFIRMED: "Đã xác nhận",
  SENT: "Đã gửi",
  ACKNOWLEDGED: "Nhà cung cấp đã nhận",
  PARTIALLY_DELIVERED: "Giao một phần",
  DELIVERED: "Đã giao đủ",
  CANCELLED: "Đã hủy",
};

function formatMoney(value: string, currency = "VND") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} ${currency}`;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(numeric);
}

function statusClass(status: string) {
  return `commercial-status status-${status.toLowerCase().replaceAll("_", "-")}`;
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
  onSuccess,
}: {
  kind: SourcingCommandKind;
  initialKey: string;
  children?: ReactNode;
  label: string;
  icon: ReactNode;
  tone?: "primary" | "secondary" | "risk";
  className?: string;
  onSuccess?: () => void;
}) {
  const initialState: SourcingActionState = {
    status: "idle",
    message: "",
    idempotencyKey: initialKey,
  };
  const [state, action] = useActionState(runSourcingAction, initialState);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);
  useEffect(() => {
    if (state.status === "success") onSuccessRef.current?.();
  }, [state.idempotencyKey, state.status]);
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

export function SourcingWorkspace({
  initialTab,
  data,
  initialKeys,
  today,
  canManageSuppliers,
  canManagePrices,
  canManageSourcing,
  canCreatePurchaseOrder,
  canConfirmPurchaseOrder,
  canSendPurchaseOrder,
}: {
  initialTab?: WorkspaceTab;
  data: SourcingSnapshot;
  initialKeys: Record<string, string>;
  today: string;
  canManageSuppliers: boolean;
  canManagePrices: boolean;
  canManageSourcing: boolean;
  canCreatePurchaseOrder: boolean;
  canConfirmPurchaseOrder: boolean;
  canSendPurchaseOrder: boolean;
}) {
  const { tab, setTab, pending } = useWorkspaceTab<WorkspaceTab>("allocations", initialTab);
  const [mode, setMode] = useState<SourcingMode>("WAREHOUSE");
  const [selectedLineId, setSelectedLineId] = useState(
    data.salesOrderLines[0]?.id ?? "",
  );
  const [selectedMaterialId, setSelectedMaterialId] = useState(
    data.materials[0]?.id ?? "",
  );

  const selectedLine =
    data.salesOrderLines.find((line) => line.id === selectedLineId) ??
    data.salesOrderLines[0];
  const requirement = data.fulfillmentRequirements.find(
    (item) => item.salesOrderLineId === selectedLine?.id,
  );
  const directSite = data.sites.find(
    (site) => site.id === requirement?.customerSiteId,
  );
  const directCustomer = data.customers.find(
    (customer) => customer.id === directSite?.customerId,
  );
  const selectedMaterial =
    data.materials.find((item) => item.id === selectedMaterialId) ??
    data.materials[0];
  const allocatedTotal = data.allocations.reduce(
    (sum, allocation) => sum + Number(allocation.allocatedQuantity),
    0,
  );
  const directAllocations = data.allocations.filter(
    (allocation) => allocation.sourcingMode === "SUPPLIER_DIRECT",
  ).length;
  const openOrders = data.purchaseOrders.filter(
    (order) => !["DELIVERED", "CANCELLED"].includes(order.status),
  ).length;

  return (
    <div className="commercial-workspace sourcing-workspace">
      <header className="master-page-header commercial-page-header">
        <div>
          <p className="page-context">Mua hàng · Chia nguồn</p>
          <h1>Mua & nguồn hàng</h1>
          <p>
            Chia một dòng đơn bán cho nhiều nguồn, khóa giá mua theo phiên bản
            và theo dõi giao thẳng không tạo tồn kho giả.
          </p>
        </div>
        <Link className="secondary-button button-link" href="/app/sales/orders">
          Xem đơn bán
        </Link>
      </header>
      {pending ? <p role="status">Đang tải tab...</p> : null}
      <SnapshotPagination pathname="/app/sourcing" tab={tab} page={data.page} />

      <section className="master-metrics" aria-label="Tóm tắt nguồn hàng">
        {(!initialTab || tab === "suppliers") ?
        <div>
          <strong>{data.suppliers.length}</strong>
          <span>Nhà cung cấp{data.page ? " trong trang" : ""}</span>
        </div> : null}
        {(!initialTab || tab === "allocations") ? <>
        <div>
          <strong>{data.allocations.length}</strong>
          <span>Phần chia nguồn{data.page ? " trong trang" : ""}</span>
        </div>
        <div>
          <strong>{directAllocations}</strong>
          <span>Giao thẳng{data.page ? " trong trang" : ""}</span>
        </div>
        </> : null}
        {(!initialTab || tab === "orders") ?
        <div>
          <strong>{openOrders}</strong>
          <span>Đơn mua đang mở{data.page ? " trong trang" : ""}</span>
        </div> : null}
      </section>

      <div
        className="master-tabs commercial-tabs"
        role="tablist"
        aria-label="Nội dung nguồn hàng"
      >
        <button
          aria-selected={tab === "allocations"}
          onClick={() => setTab("allocations")}
          role="tab"
          type="button"
        >
          <Split aria-hidden="true" size={20} /> Chia nguồn
        </button>
        <button
          aria-selected={tab === "orders"}
          onClick={() => setTab("orders")}
          role="tab"
          type="button"
        >
          <ShoppingBasket aria-hidden="true" size={20} /> Đơn mua
        </button>
        <button
          aria-selected={tab === "suppliers"}
          onClick={() => setTab("suppliers")}
          role="tab"
          type="button"
        >
          <Building2 aria-hidden="true" size={20} /> Nhà cung cấp
        </button>
      </div>

      {tab === "allocations" ? (
        <div className="commercial-panel" role="tabpanel">
          <section className="critical-invariant dropship-invariant">
            <Truck aria-hidden="true" size={24} />
            <div>
              <strong>Giao thẳng không nhập kho</strong>
              <span>
                Hàng nhà cung cấp giao tới công trình không phát sinh nhập/xuất
                kho giả. Ba số lượng giao, khách nhận và tính tiền luôn lưu
                riêng.
              </span>
            </div>
          </section>

          <section
            className="fulfillment-board"
            aria-labelledby="allocation-title"
          >
            <div className="sales-order-heading">
              <div>
                <p className="page-context">Kế hoạch nguồn hàng</p>
                <h2 id="allocation-title">Các phần đã chia</h2>
                <p>{allocatedTotal} đơn vị đã được chỉ định nguồn.</p>
              </div>
              <Route aria-hidden="true" size={34} />
            </div>

            <div
              aria-label="Bảng chia nguồn, có thể cuộn ngang"
              className="master-table-wrap sourcing-table"
              role="region"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Đơn bán / vật liệu</th>
                    <th>Cách lấy hàng</th>
                    <th>Số lượng chia</th>
                    <th>Nhà cung cấp giao</th>
                    <th>Khách nhận</th>
                    <th>Tính tiền</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {data.allocations.length ? (
                    data.allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td>
                          {allocation.salesOrderNumber}
                          <small>
                            {allocation.materialName} ·{" "}
                            {allocation.materialCode}
                          </small>
                        </td>
                        <td>
                          {MODE_LABELS[allocation.sourcingMode]}
                          <small>
                            {allocation.supplierName ??
                              allocation.warehouseName ??
                              "—"}
                          </small>
                        </td>
                        <td>
                          {allocation.allocatedQuantity} {allocation.uomSymbol}
                        </td>
                        <td>{allocation.supplierDeliveredQuantity}</td>
                        <td>{allocation.customerAcceptedQuantity}</td>
                        <td>{allocation.customerBillableQuantity}</td>
                        <td>
                          <span className={statusClass(allocation.status)}>
                            {allocation.status === "ORDERED"
                              ? "Đã đặt mua"
                              : allocation.status === "IN_PROGRESS"
                                ? "Đang giao"
                                : allocation.status === "COMPLETED"
                                  ? "Hoàn tất"
                                  : "Đã lập kế hoạch"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-table-cell" colSpan={7}>
                        Chưa có phần chia nguồn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {canManageSourcing && selectedLine && requirement ? (
            <details className="master-form-disclosure commercial-create-disclosure">
              <summary>
                <Split aria-hidden="true" size={22} /> Chia thêm một nguồn
              </summary>
              <CommandForm
                className="commercial-command-form sourcing-command-form"
                icon={<PackageSearch aria-hidden="true" size={19} />}
                initialKey={initialKeys["supply.allocate"]!}
                kind="supply.allocate"
                label="Lưu phần chia nguồn"
                onSuccess={() => setMode("WAREHOUSE")}
              >
                <div className="master-form-grid">
                  <Field label="Dòng đơn bán" wide>
                    <select
                      name="salesOrderLineId"
                      onChange={(event) =>
                        setSelectedLineId(event.target.value)
                      }
                      value={selectedLine.id}
                    >
                      {data.salesOrderLines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.materialName} · {line.orderedQuantity}{" "}
                          {line.uomSymbol}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <input
                    name="fulfillmentRequirementId"
                    type="hidden"
                    value={requirement.id}
                  />
                  <Field label="Cách lấy hàng">
                    <select
                      name="sourcingMode"
                      onChange={(event) =>
                        setMode(event.target.value as SourcingMode)
                      }
                      value={mode}
                    >
                      <option value="WAREHOUSE">Lấy từ kho</option>
                      <option value="SUPPLIER_DIRECT">
                        Nhà cung cấp giao thẳng
                      </option>
                      <option value="SUPPLIER_TO_WAREHOUSE">
                        Nhà cung cấp giao về kho
                      </option>
                    </select>
                  </Field>
                  <Field label="Số lượng">
                    <input
                      min="0.000001"
                      name="quantity"
                      required
                      step="0.000001"
                      type="number"
                    />
                  </Field>
                  {mode !== "WAREHOUSE" ? (
                    <Field label="Nhà cung cấp">
                      <select name="supplierId" required>
                        {data.suppliers
                          .filter((supplier) => supplier.isActive)
                          .map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.code} · {supplier.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ) : null}
                  {mode !== "SUPPLIER_DIRECT" ? (
                    <Field label="Kho nhận hàng">
                      <select name="warehouseId" required>
                        {data.warehouses
                          .filter((warehouse) => warehouse.isActive)
                          .map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.code} · {warehouse.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ) : null}
                  {mode === "SUPPLIER_DIRECT" ? (
                    <div className="direct-route-preview master-field-wide">
                      <Truck aria-hidden="true" size={21} />
                      <div>
                        <strong>
                          Giao thẳng tới {directSite?.name ?? "công trình"}
                        </strong>
                        <span>
                          {directCustomer?.name ?? "Khách trên đơn bán"}
                        </span>
                      </div>
                      <input
                        name="directCustomerId"
                        type="hidden"
                        value={directCustomer?.id ?? ""}
                      />
                      <input
                        name="directCustomerSiteId"
                        type="hidden"
                        value={directSite?.id ?? ""}
                      />
                    </div>
                  ) : null}
                </div>
              </CommandForm>
            </details>
          ) : null}

          {canCreatePurchaseOrder ? (
            <section className="po-ready-list" aria-labelledby="po-ready-title">
              <h2 id="po-ready-title">Nguồn nhà cung cấp chờ lập đơn mua</h2>
              {data.allocations
                .filter(
                  (allocation) =>
                    allocation.sourcingMode !== "WAREHOUSE" &&
                    !allocation.purchaseOrderLineId,
                )
                .map((allocation) => (
                  <article key={allocation.id}>
                    <div>
                      <strong>{allocation.supplierName}</strong>
                      <span>
                        {allocation.materialName} ·{" "}
                        {allocation.allocatedQuantity} {allocation.uomSymbol}
                      </span>
                    </div>
                    <CommandForm
                      icon={<FilePlus2 aria-hidden="true" size={18} />}
                      initialKey={
                        initialKeys[`purchase-order.create:${allocation.id}`]!
                      }
                      kind="purchase-order.create"
                      label="Tạo đơn mua"
                    >
                      <input
                        name="supplyAllocationId"
                        type="hidden"
                        value={allocation.id}
                      />
                    </CommandForm>
                  </article>
                ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "orders" ? (
        <div className="commercial-panel" role="tabpanel">
          <section className="critical-invariant">
            <ShieldCheck aria-hidden="true" size={24} />
            <div>
              <strong>Xác nhận đơn mua chưa tạo công nợ nhà cung cấp</strong>
              <span>
                Giá mua và đơn vị tính đã được chụp lại. Công nợ chỉ được ghi
                nhận ở phase tài chính sau bằng chứng giao/nhận phù hợp.
              </span>
            </div>
          </section>

          <div className="order-card-list">
            {data.purchaseOrders.map((order) => {
              const lines = data.purchaseOrderLines.filter(
                (line) => line.purchaseOrderId === order.id,
              );
              const evidence = data.evidence.filter(
                (item) => item.purchaseOrderId === order.id,
              );
              return (
                <article
                  className="sales-order-card purchase-order-card"
                  key={order.id}
                >
                  <div className="sales-order-heading">
                    <div>
                      <span className={statusClass(order.status)}>
                        {PO_STATUS_LABELS[order.status]}
                      </span>
                      <h2>{order.purchaseOrderNumber}</h2>
                      <p>{order.supplierName}</p>
                    </div>
                    <div className="quote-total">
                      <small>Tổng đơn mua</small>
                      <strong>
                        {formatMoney(order.totalAmount, order.currency)}
                      </strong>
                      <span>{MODE_LABELS[order.deliveryMode]}</span>
                    </div>
                  </div>

                  <div className="order-snapshot-grid">
                    <div>
                      <span>Điểm nhận</span>
                      <strong>
                        {order.deliveryMode === "SUPPLIER_DIRECT"
                          ? order.directCustomerSiteName
                          : order.warehouseName}
                      </strong>
                    </div>
                    <div>
                      <span>Giá mua</span>
                      <strong>Đã chụp và khóa theo dòng</strong>
                    </div>
                    <div>
                      <span>Bằng chứng</span>
                      <strong>{evidence.length} tệp đã liên kết</strong>
                    </div>
                  </div>

                  <div
                    aria-label={`Dòng ${order.purchaseOrderNumber}, có thể cuộn ngang`}
                    className="master-table-wrap compact-order-lines"
                    role="region"
                    tabIndex={0}
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Vật liệu</th>
                          <th>Số lượng</th>
                          <th>Giá mua đã chụp</th>
                          <th>Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line.id}>
                            <td>
                              {line.materialName}
                              <small>{line.materialCode}</small>
                            </td>
                            <td>
                              {line.orderedQuantity} {line.uomSymbol}
                            </td>
                            <td>{formatMoney(line.unitCost, line.currency)}</td>
                            <td>
                              {formatMoney(line.lineAmount, line.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="po-action-row">
                    {order.status === "DRAFT" && canConfirmPurchaseOrder ? (
                      <CommandForm
                        icon={<ClipboardCheck aria-hidden="true" size={18} />}
                        initialKey={
                          initialKeys[`purchase-order.confirm:${order.id}`]!
                        }
                        kind="purchase-order.confirm"
                        label="Xác nhận đơn mua"
                      >
                        <input
                          name="purchaseOrderId"
                          type="hidden"
                          value={order.id}
                        />
                      </CommandForm>
                    ) : null}
                    {order.status === "CONFIRMED" && canSendPurchaseOrder ? (
                      <CommandForm
                        icon={<Send aria-hidden="true" size={18} />}
                        initialKey={
                          initialKeys[`purchase-order.send:${order.id}`]!
                        }
                        kind="purchase-order.send"
                        label="Gửi nhà cung cấp"
                      >
                        <input
                          name="purchaseOrderId"
                          type="hidden"
                          value={order.id}
                        />
                      </CommandForm>
                    ) : null}
                    {order.status === "SENT" && canSendPurchaseOrder ? (
                      <CommandForm
                        icon={<BadgeCheck aria-hidden="true" size={18} />}
                        initialKey={
                          initialKeys[`purchase-order.acknowledge:${order.id}`]!
                        }
                        kind="purchase-order.acknowledge"
                        label="Ghi nhận đã nhận đơn"
                      >
                        <input
                          name="purchaseOrderId"
                          type="hidden"
                          value={order.id}
                        />
                      </CommandForm>
                    ) : null}
                    {!(
                      ["DELIVERED", "CANCELLED"] as PurchaseOrderStatus[]
                    ).includes(order.status) && canSendPurchaseOrder ? (
                      <details className="cancel-po-disclosure">
                        <summary>Hủy đơn mua</summary>
                        <CommandForm
                          icon={<XCircle aria-hidden="true" size={18} />}
                          initialKey={
                            initialKeys[`purchase-order.cancel:${order.id}`]!
                          }
                          kind="purchase-order.cancel"
                          label="Xác nhận hủy"
                          tone="risk"
                        >
                          <input
                            name="purchaseOrderId"
                            type="hidden"
                            value={order.id}
                          />
                          <Field label="Lý do hủy">
                            <textarea
                              minLength={10}
                              name="reason"
                              required
                              rows={2}
                            />
                          </Field>
                        </CommandForm>
                      </details>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "suppliers" ? (
        <div className="commercial-panel" role="tabpanel">
          <section
            className="supplier-grid"
            aria-label="Danh sách nhà cung cấp"
          >
            {data.suppliers.map((supplier) => (
              <article className="supplier-card" key={supplier.id}>
                <Building2 aria-hidden="true" size={28} />
                <div>
                  <span>{supplier.code}</span>
                  <h2>{supplier.name}</h2>
                  <p>{supplier.address ?? "Chưa có địa chỉ"}</p>
                  <small>
                    {supplier.phone ?? supplier.email ?? "Chưa có liên hệ"}
                  </small>
                </div>
              </article>
            ))}
          </section>

          <section
            className="fulfillment-board"
            aria-labelledby="supplier-price-title"
          >
            <div className="sales-order-heading">
              <div>
                <p className="page-context">Lịch sử mua hàng</p>
                <h2 id="supplier-price-title">Giá nhà cung cấp</h2>
                <p>
                  Mỗi lần đổi giá tạo một phiên bản mới; giá cũ vẫn được giữ.
                </p>
              </div>
              <History aria-hidden="true" size={34} />
            </div>
            <div
              aria-label="Bảng lịch sử giá mua, có thể cuộn ngang"
              className="master-table-wrap sourcing-table"
              role="region"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Nhà cung cấp</th>
                    <th>Vật liệu</th>
                    <th>Đơn giá</th>
                    <th>Phiên bản</th>
                    <th>Hiệu lực</th>
                  </tr>
                </thead>
                <tbody>
                  {data.supplierPrices.map((price) => (
                    <tr key={price.id}>
                      <td>{price.supplierName}</td>
                      <td>
                        {price.materialName}
                        <small>{price.materialCode}</small>
                      </td>
                      <td>
                        {formatMoney(price.unitCost, price.currency)}/
                        {price.uomSymbol}
                      </td>
                      <td>v{price.version}</td>
                      <td>
                        {new Date(price.validFrom).toLocaleDateString("vi-VN")}
                        <small>
                          {price.validTo
                            ? `đến ${price.validTo}`
                            : "đang áp dụng"}
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="supplier-form-grid">
            {canManageSuppliers ? (
              <details className="master-form-disclosure commercial-create-disclosure">
                <summary>
                  <FilePlus2 aria-hidden="true" size={22} /> Thêm nhà cung cấp
                </summary>
                <CommandForm
                  className="commercial-command-form"
                  icon={<FileCheck2 aria-hidden="true" size={19} />}
                  initialKey={initialKeys["supplier.create"]!}
                  kind="supplier.create"
                  label="Lưu nhà cung cấp"
                >
                  <div className="master-form-grid">
                    <Field label="Mã nhà cung cấp">
                      <input maxLength={32} name="code" required />
                    </Field>
                    <Field label="Tên nhà cung cấp">
                      <input maxLength={180} name="name" required />
                    </Field>
                    <Field label="Mã số thuế">
                      <input maxLength={32} name="taxCode" />
                    </Field>
                    <Field label="Điện thoại">
                      <input maxLength={32} name="phone" />
                    </Field>
                    <Field label="Email">
                      <input maxLength={180} name="email" type="email" />
                    </Field>
                    <Field label="Địa chỉ">
                      <input maxLength={300} name="address" />
                    </Field>
                  </div>
                </CommandForm>
              </details>
            ) : null}

            {canManagePrices && selectedMaterial ? (
              <details className="master-form-disclosure commercial-create-disclosure">
                <summary>
                  <CircleDollarSign aria-hidden="true" size={22} /> Ghi nhận giá
                  mua mới
                </summary>
                <CommandForm
                  className="commercial-command-form"
                  icon={<CircleDollarSign aria-hidden="true" size={19} />}
                  initialKey={initialKeys["supplier-price.record"]!}
                  kind="supplier-price.record"
                  label="Lưu phiên bản giá"
                >
                  <div className="master-form-grid">
                    <Field label="Nhà cung cấp">
                      <select name="supplierId">
                        {data.suppliers
                          .filter((supplier) => supplier.isActive)
                          .map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.code} · {supplier.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Vật liệu">
                      <select
                        name="materialId"
                        onChange={(event) =>
                          setSelectedMaterialId(event.target.value)
                        }
                        value={selectedMaterial.id}
                      >
                        {data.materials
                          .filter((material) => material.isActive)
                          .map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.code} · {material.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <input
                      name="uomId"
                      type="hidden"
                      value={selectedMaterial.purchaseUomId}
                    />
                    <Field
                      label={`Đơn giá / ${selectedMaterial.purchaseUomSymbol}`}
                    >
                      <input
                        min="0.01"
                        name="unitCost"
                        required
                        step="0.01"
                        type="number"
                      />
                    </Field>
                    <Field label="Tiền tệ">
                      <input
                        defaultValue="VND"
                        maxLength={3}
                        name="currency"
                        required
                      />
                    </Field>
                    <Field label="Ngày hiệu lực">
                      <input
                        defaultValue={today}
                        min={today}
                        name="validFrom"
                        required
                        type="date"
                      />
                    </Field>
                    <Field label="Lý do ghi nhận" wide>
                      <textarea
                        minLength={10}
                        name="changeReason"
                        required
                        rows={2}
                      />
                    </Field>
                  </div>
                </CommandForm>
              </details>
            ) : null}
          </div>

          <section className="evidence-note">
            <FileCheck2 aria-hidden="true" size={24} />
            <div>
              <strong>Bằng chứng đơn mua được liên kết riêng</strong>
              <span>
                Báo giá, xác nhận và chứng từ dùng kho bằng chứng riêng tư của
                hệ thống; không công khai URL tệp.
              </span>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
