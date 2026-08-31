"use client";

import {
  useActionState,
  useState,
  type ChangeEventHandler,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import {
  Boxes,
  ClipboardCheck,
  PackageCheck,
  PackageMinus,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import {
  runInventoryAction,
  type InventoryActionState,
} from "@/app/app/inventory/actions";
import type {
  InventoryCommandKind,
  InventorySnapshot,
} from "@/modules/inventory/types";

function number(value: string) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(
    Number(value),
  );
}
function money(value: string) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}
function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="primary-button commercial-submit"
      disabled={pending}
      type="submit"
    >
      {pending ? "Đang xử lý…" : children}
    </button>
  );
}
function Form({
  kind,
  idempotencyKey,
  children,
  label,
}: {
  kind: InventoryCommandKind;
  idempotencyKey: string;
  children: ReactNode;
  label: string;
}) {
  const initial: InventoryActionState = {
    status: "idle",
    message: "",
    idempotencyKey,
  };
  const [state, action] = useActionState(runInventoryAction, initial);
  return (
    <form action={action} className="commercial-inline-form">
      <input name="kind" type="hidden" value={kind} />
      <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
      {children}
      <Submit>{label}</Submit>
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
function Select({
  label,
  name,
  children,
  value,
  onChange,
}: {
  label: string;
  name: string;
  children: ReactNode;
  value?: string;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
}) {
  return (
    <label className="master-field">
      <span>{label}</span>
      <select name={name} onChange={onChange} required value={value}>
        {children}
      </select>
    </label>
  );
}
function Input({
  label,
  name,
  value,
  min = "0",
}: {
  label: string;
  name: string;
  value?: string;
  min?: string;
}) {
  return (
    <label className="master-field">
      <span>{label}</span>
      <input
        defaultValue={value}
        min={min}
        name={name}
        required
        step="0.000001"
        type="number"
      />
    </label>
  );
}
function Reason() {
  return (
    <label className="master-field master-field-wide">
      <span>Lý do nghiệp vụ</span>
      <input
        defaultValue="Ghi nhận theo chứng từ đã kiểm tra"
        minLength={10}
        name="reason"
        required
      />
    </label>
  );
}

export function InventoryWorkspace({
  data,
  initialKeys,
  canReserve,
  canReceive,
  canIssue,
  canCount,
  canAdjust,
  canManagePolicy,
}: {
  data: InventorySnapshot;
  initialKeys: Record<string, string>;
  canReserve: boolean;
  canReceive: boolean;
  canIssue: boolean;
  canCount: boolean;
  canAdjust: boolean;
  canManagePolicy: boolean;
}) {
  const material = data.materials[0];
  const warehouse = data.warehouses[0];
  const [receiptMaterialId, setReceiptMaterialId] = useState(
    material?.id ?? "",
  );
  const receiptMaterial =
    data.materials.find((item) => item.id === receiptMaterialId) ?? material;
  const keyFor = (name: string) => initialKeys[name] ?? `inventory-${name}`;
  return (
    <div className="commercial-workspace inventory-workspace">
      <header className="master-page-header commercial-page-header">
        <div>
          <p className="page-context">Vận hành · Kho</p>
          <h1>Kho & bãi</h1>
          <p>
            Sổ chuyển động là nguồn sự thật; tồn thực tế, đã giữ và khả dụng đều
            được suy ra, không sửa tay.
          </p>
        </div>
        <div className="commercial-hero-icon">
          <Boxes size={30} />
        </div>
      </header>
      <section className="commercial-kpi-grid" aria-label="Tổng quan tồn kho">
        <article>
          <PackageCheck />
          <span>Tồn thực tế</span>
          <strong>
            {number(
              data.positions
                .reduce((sum, row) => sum + Number(row.onHandQuantity), 0)
                .toString(),
            )}
          </strong>
        </article>
        <article>
          <ShieldCheck />
          <span>Đã giữ</span>
          <strong>
            {number(
              data.positions
                .reduce((sum, row) => sum + Number(row.reservedQuantity), 0)
                .toString(),
            )}
          </strong>
        </article>
        <article>
          <PackageMinus />
          <span>Khả dụng</span>
          <strong>
            {number(
              data.positions
                .reduce((sum, row) => sum + Number(row.availableQuantity), 0)
                .toString(),
            )}
          </strong>
        </article>
        <article>
          <TriangleAlert />
          <span>Sắp chạm ngưỡng</span>
          <strong>
            {data.positions.filter((row) => row.isLowStock).length}
          </strong>
        </article>
      </section>

      <section className="commercial-panel">
        <div className="commercial-section-heading">
          <div>
            <p className="page-context">Số dư suy ra</p>
            <h2>Tồn theo kho và vật liệu</h2>
          </div>
        </div>
        <div
          aria-label="Bảng tồn kho, có thể cuộn ngang"
          className="commercial-table-shell"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Kho / vật liệu</th>
                <th>Thực tế</th>
                <th>Đã giữ</th>
                <th>Khả dụng</th>
                <th>Giá vốn BQ</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.map((row) => (
                <tr key={`${row.warehouseId}:${row.materialId}`}>
                  <td>
                    <strong>
                      {row.materialCode} · {row.materialName}
                    </strong>
                    <small>
                      {row.warehouseName} · {row.baseUomSymbol}
                    </small>
                  </td>
                  <td>{number(row.onHandQuantity)}</td>
                  <td>{number(row.reservedQuantity)}</td>
                  <td>{number(row.availableQuantity)}</td>
                  <td>{money(row.movingAverageCost)}</td>
                  <td>
                    <span
                      className={`commercial-status ${row.isLowStock ? "status-cancelled" : "status-confirmed"}`}
                    >
                      {row.isLowStock ? "Cần đặt thêm" : "Bình thường"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="commercial-two-column">
        <section className="commercial-panel">
          <div className="commercial-section-heading">
            <div>
              <p className="page-context">Giữ hàng</p>
              <h2>Allocation từ kho</h2>
            </div>
          </div>
          {data.warehouseAllocations.map((row) => (
            <article className="commercial-card" key={row.id}>
              <strong>
                {row.salesOrderNumber} · {row.materialName}
              </strong>
              <p>
                {number(row.allocatedQuantity)} {row.uomSymbol} ·{" "}
                {row.warehouseName}
              </p>
              {canReserve ? (
                <Form
                  kind="inventory.reserve"
                  idempotencyKey={keyFor(`inventory.reserve:${row.id}`)}
                  label="Giữ tồn kho"
                >
                  <input
                    name="supplyAllocationId"
                    type="hidden"
                    value={row.id}
                  />
                </Form>
              ) : null}
            </article>
          ))}
          {!data.warehouseAllocations.length ? (
            <p className="commercial-empty">
              Không có allocation chờ giữ hàng.
            </p>
          ) : null}
        </section>
        <section className="commercial-panel">
          <div className="commercial-section-heading">
            <div>
              <p className="page-context">Reservation</p>
              <h2>Hàng đang giữ</h2>
            </div>
          </div>
          {data.reservations.map((row) => (
            <article className="commercial-card" key={row.id}>
              <strong>
                {row.reservationNumber} · {row.materialName}
              </strong>
              <p>
                {number(row.documentQuantity)} {row.documentUomSymbol} →{" "}
                {number(row.reservedQuantity)} {row.baseUomSymbol}
              </p>
              <small>
                {row.salesOrderNumber} · {row.status}
              </small>
              {canReserve && row.status === "ACTIVE" ? (
                <Form
                  kind="reservation.release"
                  idempotencyKey={keyFor(`reservation.release:${row.id}`)}
                  label="Giải phóng"
                >
                  <input name="reservationId" type="hidden" value={row.id} />
                  <Reason />
                </Form>
              ) : null}
            </article>
          ))}
        </section>
      </div>

      {warehouse && material && receiptMaterial ? (
        <section className="commercial-panel">
          <div className="commercial-section-heading">
            <div>
              <p className="page-context">Giao dịch kho</p>
              <h2>Nhập · xuất · kiểm kê</h2>
            </div>
          </div>
          <div className="commercial-form-grid">
            {canReceive ? (
              <Form
                kind="receipt.confirm"
                idempotencyKey={keyFor("receipt.confirm")}
                label="Xác nhận nhập kho"
              >
                <Select label="Kho nhập" name="warehouseId">
                  {data.warehouses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Vật liệu nhập"
                  name="materialId"
                  onChange={(event) => setReceiptMaterialId(event.target.value)}
                  value={receiptMaterialId}
                >
                  {data.materials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </Select>
                <input
                  name="documentUomId"
                  type="hidden"
                  value={receiptMaterial.baseUomId}
                />
                <Input
                  label={`Số lượng nhập (${receiptMaterial.baseUomSymbol})`}
                  name="documentQuantity"
                  value="1000"
                  min="0.000001"
                />
                <Input
                  label="Đơn giá nhập"
                  name="documentUnitCost"
                  value="1200"
                  min="0.01"
                />
                <Reason />
              </Form>
            ) : null}
            {canIssue ? (
              <Form
                kind="issue.confirm"
                idempotencyKey={keyFor("issue.confirm")}
                label="Xác nhận xuất kho"
              >
                <Select label="Kho xuất" name="warehouseId">
                  {data.warehouses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </Select>
                <Select label="Vật liệu xuất" name="materialId">
                  {data.materials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name} ({item.baseUomSymbol})
                    </option>
                  ))}
                </Select>
                <Input
                  label="Số lượng xuất (đơn vị gốc)"
                  name="baseQuantity"
                  value="100"
                  min="0.000001"
                />
                <Select label="Reservation (nếu có)" name="reservationId">
                  <option value="">Xuất tồn khả dụng</option>
                  {data.reservations
                    .filter((row) => row.status === "ACTIVE")
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.reservationNumber} · {row.materialName} ·{" "}
                        {row.reservedQuantity} {row.baseUomSymbol}
                      </option>
                    ))}
                </Select>
                <Reason />
              </Form>
            ) : null}
            {canCount ? (
              <Form
                kind="stock-count.record"
                idempotencyKey={keyFor("stock-count.record")}
                label="Chụp và ghi kiểm kê"
              >
                <Select label="Kho kiểm kê" name="warehouseId">
                  {data.warehouses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </Select>
                <Select label="Vật liệu kiểm kê" name="materialId">
                  {data.materials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name} ({item.baseUomSymbol})
                    </option>
                  ))}
                </Select>
                <Input
                  label="Số đếm thực tế (đơn vị gốc)"
                  name="countedQuantity"
                  value="124950"
                />
                <Reason />
              </Form>
            ) : null}
            {canManagePolicy ? (
              <Form
                kind="reorder-policy.set"
                idempotencyKey={keyFor("reorder-policy.set")}
                label="Lưu ngưỡng tồn"
              >
                <Select label="Kho áp dụng" name="warehouseId">
                  {data.warehouses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </Select>
                <Select label="Vật liệu áp dụng" name="materialId">
                  {data.materials.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name} ({item.baseUomSymbol})
                    </option>
                  ))}
                </Select>
                <Input
                  label="Mức tối thiểu"
                  name="minimumQuantity"
                  value="30000"
                />
                <Input
                  label="Mức mục tiêu"
                  name="targetQuantity"
                  value="120000"
                />
                <Reason />
              </Form>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="commercial-panel">
        <div className="commercial-section-heading">
          <div>
            <p className="page-context">Kiểm kê</p>
            <h2>Chênh lệch chờ xử lý</h2>
          </div>
        </div>
        {data.stockCounts.map((row) => (
          <article className="commercial-card" key={row.id}>
            <ClipboardCheck />
            <strong>
              {row.countNumber} · {row.materialName}
            </strong>
            <p>
              Hệ thống {row.systemQuantity ?? "—"} · Đếm {row.countedQuantity} ·
              Lệch {row.varianceQuantity ?? "—"} {row.baseUomSymbol}
            </p>
            {canAdjust &&
            row.status === "COUNTED" &&
            row.varianceQuantity !== "0" &&
            data.evidence[0] ? (
              <Form
                kind="stock-adjustment.approve"
                idempotencyKey={keyFor(`stock-adjustment.approve:${row.id}`)}
                label="Duyệt điều chỉnh"
              >
                <input name="stockCountId" type="hidden" value={row.id} />
                <Select label="Bằng chứng" name="evidenceId">
                  {data.evidence.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
                <Reason />
              </Form>
            ) : null}
          </article>
        ))}
      </section>

      <section className="commercial-panel">
        <div className="commercial-section-heading">
          <div>
            <p className="page-context">Ledger bất biến</p>
            <h2>Sổ chuyển động kho</h2>
          </div>
        </div>
        <div
          aria-label="Sổ chuyển động kho, có thể cuộn ngang"
          className="commercial-table-shell"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Số phiếu</th>
                <th>Loại</th>
                <th>Vật liệu</th>
                <th>Biến động</th>
                <th>Tồn sau</th>
                <th>Giá vốn BQ sau</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.movementNumber}</strong>
                    <small>{row.warehouseName}</small>
                  </td>
                  <td>{row.movementType}</td>
                  <td>{row.materialName}</td>
                  <td>
                    {number(row.quantityDelta)} {row.baseUomSymbol}
                  </td>
                  <td>{number(row.onHandAfter)}</td>
                  <td>{money(row.movingAverageCostAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
