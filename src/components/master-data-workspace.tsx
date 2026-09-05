"use client";
import { SnapshotPagination } from "@/components/snapshot-pagination";
import { useWorkspaceTab } from "@/components/use-workspace-tab";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  Boxes,
  Calculator,
  Database,
  PackageCheck,
  Plus,
  Ruler,
  Truck,
  Users,
} from "lucide-react";

import {
  saveMasterDataAction,
  toggleMasterDataAction,
  type MasterDataActionState,
} from "@/app/app/data/actions";
import { convertQuantity } from "@/modules/master-data/conversion";
import type {
  MasterDataSnapshot,
  MasterEntityKind,
  ToggleableMasterEntity,
} from "@/modules/master-data/types";

type WorkspaceTab = "materials" | "operations" | "people";

const METHOD_LABELS = {
  EXACT: "Chính xác",
  PACKAGING: "Quy cách vật liệu",
  ESTIMATED: "Ước tính",
  MEASURED: "Theo đo lường",
} as const;

const DIMENSION_LABELS = {
  MASS: "Khối lượng",
  VOLUME: "Thể tích",
  COUNT: "Đếm",
  LENGTH: "Chiều dài",
  AREA: "Diện tích",
  OTHER: "Khác",
} as const;

function SubmitButton({ label = "Lưu dữ liệu" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="primary-button master-submit"
      disabled={pending}
      type="submit"
    >
      <PackageCheck aria-hidden="true" size={19} />
      {pending ? "Đang lưu…" : label}
    </button>
  );
}

function ManagedForm({
  kind,
  title,
  initialKey,
  children,
}: {
  kind: MasterEntityKind;
  title: string;
  initialKey: string;
  children: ReactNode;
}) {
  const initialState: MasterDataActionState = {
    status: "idle",
    message: "",
    idempotencyKey: initialKey,
  };
  const [state, action] = useActionState(saveMasterDataAction, initialState);

  return (
    <details className="master-form-disclosure">
      <summary>
        <Plus aria-hidden="true" size={20} />
        {title}
      </summary>
      <form action={action} className="master-form">
        <input name="kind" type="hidden" value={kind} />
        <input
          name="idempotencyKey"
          type="hidden"
          value={state.idempotencyKey}
        />
        <div className="master-form-grid">{children}</div>
        <SubmitButton />
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
    </details>
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

function StatusText({ active }: { active: boolean }) {
  return (
    <span
      className={active ? "record-status active" : "record-status inactive"}
    >
      {active ? "Đang dùng" : "Tạm ngưng"}
    </span>
  );
}

function ToggleButton({
  kind,
  id,
  isActive,
  toggleKeys,
}: {
  kind: ToggleableMasterEntity;
  id: string;
  isActive: boolean;
  toggleKeys: Record<string, string>;
}) {
  const idempotencyKey = toggleKeys[`${kind}:${id}`];
  return (
    <form action={toggleMasterDataAction}>
      <input name="kind" type="hidden" value={kind} />
      <input name="id" type="hidden" value={id} />
      <input name="isActive" type="hidden" value={String(!isActive)} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey ?? ""} />
      <button className="table-action" disabled={!idempotencyKey} type="submit">
        {isActive ? "Tạm ngưng" : "Kích hoạt"}
      </button>
    </form>
  );
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return (
    <tr>
      <td className="empty-table-cell" colSpan={columns}>
        {label}
      </td>
    </tr>
  );
}

function ConversionCalculator({ data }: { data: MasterDataSnapshot }) {
  const current = data.conversions.filter((conversion) => conversion.isCurrent);
  const [conversionId, setConversionId] = useState(current[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const selected =
    current.find((conversion) => conversion.id === conversionId) ?? current[0];
  const result = (() => {
    if (!selected) return null;
    const source = data.uoms.find((uom) => uom.id === selected.fromUomId);
    const target = data.uoms.find((uom) => uom.id === selected.toUomId);
    if (!source || !target) return null;
    try {
      return convertQuantity(quantity, {
        sourceQuantity: selected.sourceQuantity,
        targetQuantity: selected.targetQuantity,
        method: selected.method,
        roundingScale: selected.roundingScale,
        sourceDimension: source.dimension,
        targetDimension: target.dimension,
      });
    } catch {
      return null;
    }
  })();

  return (
    <section
      className="conversion-calculator"
      aria-labelledby="conversion-calculator-title"
    >
      <div className="section-heading compact-heading">
        <span className="section-icon" aria-hidden="true">
          <Calculator size={24} />
        </span>
        <div>
          <h2 id="conversion-calculator-title">Tính thử quy đổi</h2>
          <p>
            Kết quả dùng đúng version hiện hành và luôn công bố phương pháp.
          </p>
        </div>
      </div>
      {selected ? (
        <div className="calculator-grid">
          <Field label="Vật liệu và quy đổi" wide>
            <select
              value={selected.id}
              onChange={(event) => setConversionId(event.target.value)}
            >
              {current.map((conversion) => (
                <option key={conversion.id} value={conversion.id}>
                  {conversion.materialName}: {conversion.sourceQuantity}{" "}
                  {conversion.fromUomSymbol} → {conversion.targetQuantity}{" "}
                  {conversion.toUomSymbol}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Số lượng (${selected.fromUomSymbol})`}>
            <input
              inputMode="decimal"
              min="0.000001"
              onChange={(event) => setQuantity(event.target.value)}
              step="any"
              type="number"
              value={quantity}
            />
          </Field>
          <div className="conversion-result" aria-live="polite">
            <small>Kết quả theo {selected.toUomSymbol}</small>
            <strong>
              {result?.quantity ?? "—"} {selected.toUomSymbol}
            </strong>
            <span>{result?.methodLabel ?? METHOD_LABELS[selected.method]}</span>
            {result?.precisionNotice ? <p>{result.precisionNotice}</p> : null}
          </div>
        </div>
      ) : (
        <p className="empty-inline">
          Hãy tạo ít nhất một quy đổi để dùng bộ tính.
        </p>
      )}
    </section>
  );
}

export function MasterDataWorkspace({
  initialTab,
  data,
  initialKeys,
  toggleKeys,
}: {
  initialTab?: WorkspaceTab;
  data: MasterDataSnapshot;
  initialKeys: Record<MasterEntityKind, string>;
  toggleKeys: Record<string, string>;
}) {
  const { tab, setTab, pending } = useWorkspaceTab<WorkspaceTab>("materials", initialTab);
  const activeMaterials = data.materials.filter((item) => item.isActive).length;
  const currentConversions = data.conversions.filter(
    (item) => item.isCurrent,
  ).length;
  const activeVehicles = data.vehicles.filter((item) => item.isActive).length;

  return (
    <div className="master-data-workspace">
      <header className="master-page-header">
        <div>
          <p className="page-context">Dữ liệu nền vận hành</p>
          <h1>Vật liệu, đơn vị và năng lực</h1>
          <p>
            Quản lý danh mục P2 với conversion theo từng vật liệu, lịch sử bất
            biến và tải xe chỉ dùng cho lập kế hoạch.
          </p>
        </div>
        <Database aria-hidden="true" size={54} />
      </header>
      {pending ? <p role="status">Đang tải tab...</p> : null}
      <SnapshotPagination pathname="/app/data" tab={tab} page={data.page} />

      <section className="master-metrics" aria-label="Tóm tắt dữ liệu P2">
        {(!initialTab || tab === "materials") ? <>
        <div>
          <strong>{activeMaterials}</strong>
          <span>vật liệu đang dùng{data.page ? " trong trang" : ""}</span>
        </div>
        <div>
          <strong>{currentConversions}</strong>
          <span>quy đổi hiện hành{data.page ? " trong trang" : ""}</span>
        </div>
        </> : null}
        {(!initialTab || tab === "operations") ? <>
        <div>
          <strong>{data.warehouses.length}</strong>
          <span>kho / bãi</span>
        </div>
        <div>
          <strong>{activeVehicles}</strong>
          <span>phương tiện hoạt động</span>
        </div>
        </> : null}
      </section>

      <div
        className="master-tabs"
        role="tablist"
        aria-label="Nhóm dữ liệu master"
      >
        <button
          aria-selected={tab === "materials"}
          onClick={() => setTab("materials")}
          role="tab"
          type="button"
        >
          <Ruler aria-hidden="true" size={20} /> Vật liệu & đơn vị
        </button>
        <button
          aria-selected={tab === "operations"}
          onClick={() => setTab("operations")}
          role="tab"
          type="button"
        >
          <Truck aria-hidden="true" size={20} /> Kho & phương tiện
        </button>
        <button
          aria-selected={tab === "people"}
          onClick={() => setTab("people")}
          role="tab"
          type="button"
        >
          <Users aria-hidden="true" size={20} /> Nhân sự & kỹ năng
        </button>
      </div>

      {tab === "materials" ? (
        <div className="master-tab-panel" role="tabpanel">
          <ConversionCalculator data={data} />

          <section className="master-section" aria-labelledby="materials-title">
            <div className="section-heading">
              <div>
                <h2 id="materials-title">Vật liệu và UOM</h2>
                <p>
                  UOM đã dùng có thể tạm ngưng nhưng không bị xóa khỏi lịch sử.
                </p>
              </div>
            </div>
            <div className="master-table-wrap" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Mã vật liệu</th>
                    <th>Tên / nhóm</th>
                    <th>Gốc</th>
                    <th>Mua</th>
                    <th>Bán</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.materials.length ? (
                    data.materials.map((material) => (
                      <tr key={material.id}>
                        <td>
                          <strong>{material.code}</strong>
                        </td>
                        <td>
                          {material.name}
                          <small>{material.groupName}</small>
                        </td>
                        <td>{material.baseUomSymbol}</td>
                        <td>{material.purchaseUomSymbol}</td>
                        <td>{material.salesUomSymbol}</td>
                        <td>
                          <StatusText active={material.isActive} />
                        </td>
                        <td>
                          <ToggleButton
                            id={material.id}
                            isActive={material.isActive}
                            kind="material"
                            toggleKeys={toggleKeys}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow columns={7} label="Chưa có vật liệu." />
                  )}
                </tbody>
              </table>
            </div>
            <div className="form-stack">
              <ManagedForm
                initialKey={initialKeys["material-group"]}
                kind="material-group"
                title="Thêm hoặc cập nhật nhóm vật liệu"
              >
                <Field label="Mã nhóm">
                  <input name="code" placeholder="CEMENT" required />
                </Field>
                <Field label="Tên nhóm">
                  <input name="name" placeholder="Xi măng" required />
                </Field>
                <Field label="Mô tả" wide>
                  <input name="description" placeholder="Mô tả ngắn" />
                </Field>
              </ManagedForm>
              <ManagedForm
                initialKey={initialKeys.uom}
                kind="uom"
                title="Thêm hoặc cập nhật UOM"
              >
                <Field label="Mã UOM">
                  <input name="code" placeholder="KG" required />
                </Field>
                <Field label="Ký hiệu">
                  <input name="symbol" placeholder="kg" required />
                </Field>
                <Field label="Tên đơn vị">
                  <input name="name" placeholder="Kilôgam" required />
                </Field>
                <Field label="Loại đơn vị">
                  <select name="dimension" defaultValue="MASS">
                    {Object.entries(DIMENSION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Số chữ số thập phân">
                  <select name="decimalScale" defaultValue="3">
                    {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
              </ManagedForm>
              <ManagedForm
                initialKey={initialKeys.material}
                kind="material"
                title="Thêm hoặc cập nhật vật liệu"
              >
                <Field label="Mã vật liệu">
                  <input name="code" placeholder="CEMENT-PCB40" required />
                </Field>
                <Field label="Tên vật liệu">
                  <input name="name" placeholder="Xi măng PCB40" required />
                </Field>
                <Field label="Nhóm vật liệu">
                  <select name="groupId" required>
                    <option value="">Chọn nhóm</option>
                    {data.materialGroups
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="UOM gốc">
                  <select name="baseUomId" required>
                    <option value="">Chọn UOM</option>
                    {data.uoms
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.symbol} — {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="UOM mua">
                  <select name="purchaseUomId" required>
                    <option value="">Chọn UOM</option>
                    {data.uoms
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.symbol} — {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="UOM bán">
                  <select name="salesUomId" required>
                    <option value="">Chọn UOM</option>
                    {data.uoms
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.symbol} — {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
              </ManagedForm>
            </div>
          </section>

          <section
            className="master-section"
            aria-labelledby="conversions-title"
          >
            <div className="section-heading">
              <div>
                <h2 id="conversions-title">Quy đổi theo vật liệu</h2>
                <p>Mỗi chỉnh sửa tạo version mới; version cũ chỉ được đóng.</p>
              </div>
            </div>
            <div className="master-table-wrap" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Vật liệu</th>
                    <th>Tỷ lệ về UOM gốc</th>
                    <th>Phương pháp</th>
                    <th>Version</th>
                    <th>Hiệu lực</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conversions.length ? (
                    data.conversions.map((conversion) => (
                      <tr key={conversion.id}>
                        <td>{conversion.materialName}</td>
                        <td>
                          <strong>
                            {conversion.sourceQuantity}{" "}
                            {conversion.fromUomSymbol}
                          </strong>{" "}
                          = {conversion.targetQuantity} {conversion.toUomSymbol}
                        </td>
                        <td>
                          {METHOD_LABELS[conversion.method]}
                          {conversion.method === "ESTIMATED" ? (
                            <small>Không phải tỷ lệ chính xác</small>
                          ) : null}
                        </td>
                        <td>v{conversion.version}</td>
                        <td>
                          <StatusText active={conversion.isCurrent} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow columns={5} label="Chưa có quy đổi." />
                  )}
                </tbody>
              </table>
            </div>
            <ManagedForm
              initialKey={initialKeys.conversion}
              kind="conversion"
              title="Tạo version quy đổi mới"
            >
              <Field label="Vật liệu">
                <select name="materialId" required>
                  <option value="">Chọn vật liệu</option>
                  {data.materials
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="UOM nguồn">
                <select name="fromUomId" required>
                  <option value="">Chọn UOM phụ</option>
                  {data.uoms
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.symbol} — {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Số lượng nguồn">
                <input
                  inputMode="decimal"
                  name="sourceQuantity"
                  placeholder="1"
                  required
                />
              </Field>
              <Field label="Số lượng theo UOM gốc">
                <input
                  inputMode="decimal"
                  name="targetQuantity"
                  placeholder="50"
                  required
                />
              </Field>
              <Field label="Phương pháp">
                <select name="method" defaultValue="PACKAGING">
                  {Object.entries(METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Số chữ số làm tròn">
                <select name="roundingScale" defaultValue="3">
                  {[0, 1, 2, 3, 4, 5, 6].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
            </ManagedForm>

            <div className="subsection-grid">
              <section>
                <h3>Nhóm vật liệu</h3>
                <ul className="master-list">
                  {data.materialGroups.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.code}</strong>
                        {item.name}
                      </span>
                      <StatusText active={item.isActive} />
                      <ToggleButton
                        id={item.id}
                        isActive={item.isActive}
                        kind="material-group"
                        toggleKeys={toggleKeys}
                      />
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Danh mục UOM</h3>
                <ul className="master-list">
                  {data.uoms.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.symbol}</strong>
                        {item.name} · {DIMENSION_LABELS[item.dimension]}
                      </span>
                      <StatusText active={item.isActive} />
                      <ToggleButton
                        id={item.id}
                        isActive={item.isActive}
                        kind="uom"
                        toggleKeys={toggleKeys}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "operations" ? (
        <div className="master-tab-panel" role="tabpanel">
          <section
            className="master-section"
            aria-labelledby="operations-title"
          >
            <div className="section-heading">
              <span className="section-icon">
                <Boxes size={24} />
              </span>
              <div>
                <h2 id="operations-title">Kho, phương tiện và tải kế hoạch</h2>
                <p>
                  Hồ sơ tải không phải tỷ lệ UOM chính xác và không được dùng
                  thay conversion.
                </p>
              </div>
            </div>
            <div className="two-table-grid">
              <div className="master-table-wrap" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Kho / bãi</th>
                      <th>Địa chỉ</th>
                      <th>Trạng thái</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.warehouses.length ? (
                      data.warehouses.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.code}</strong>
                            <small>{item.name}</small>
                          </td>
                          <td>{item.address ?? "—"}</td>
                          <td>
                            <StatusText active={item.isActive} />
                          </td>
                          <td>
                            <ToggleButton
                              id={item.id}
                              isActive={item.isActive}
                              kind="warehouse"
                              toggleKeys={toggleKeys}
                            />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow columns={4} label="Chưa có kho." />
                    )}
                  </tbody>
                </table>
              </div>
              <div className="master-table-wrap" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Phương tiện</th>
                      <th>Kho chính</th>
                      <th>Năng lực vật lý</th>
                      <th>Trạng thái</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.vehicles.length ? (
                      data.vehicles.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.code}</strong>
                            <small>
                              {item.plateNumber} · {item.vehicleType}
                            </small>
                          </td>
                          <td>{item.homeWarehouseName ?? "—"}</td>
                          <td>
                            {item.maxPayloadKg
                              ? `${item.maxPayloadKg} kg`
                              : "—"}
                            {item.maxVolumeM3 ? (
                              <small>{item.maxVolumeM3} m³</small>
                            ) : null}
                          </td>
                          <td>
                            <StatusText active={item.isActive} />
                          </td>
                          <td>
                            <ToggleButton
                              id={item.id}
                              isActive={item.isActive}
                              kind="vehicle"
                              toggleKeys={toggleKeys}
                            />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow columns={5} label="Chưa có phương tiện." />
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="form-stack">
              <ManagedForm
                initialKey={initialKeys.warehouse}
                kind="warehouse"
                title="Thêm hoặc cập nhật kho / bãi"
              >
                <Field label="Mã kho">
                  <input name="code" placeholder="WH-HX" required />
                </Field>
                <Field label="Tên kho">
                  <input name="name" placeholder="Kho Hiền Xạ" required />
                </Field>
                <Field label="Địa chỉ" wide>
                  <input name="address" placeholder="Địa chỉ kho / bãi" />
                </Field>
              </ManagedForm>
              <ManagedForm
                initialKey={initialKeys.vehicle}
                kind="vehicle"
                title="Thêm hoặc cập nhật phương tiện"
              >
                <Field label="Mã xe">
                  <input name="code" placeholder="TRUCK-01" required />
                </Field>
                <Field label="Biển số">
                  <input name="plateNumber" placeholder="29C-12345" required />
                </Field>
                <Field label="Loại xe">
                  <input name="vehicleType" placeholder="Xe tải ben" required />
                </Field>
                <Field label="Kho chính">
                  <select name="homeWarehouseId">
                    <option value="">Không chọn</option>
                    {data.warehouses
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Tải trọng tối đa (kg)">
                  <input
                    inputMode="decimal"
                    name="maxPayloadKg"
                    placeholder="15000"
                  />
                </Field>
                <Field label="Thể tích tối đa (m³)">
                  <input
                    inputMode="decimal"
                    name="maxVolumeM3"
                    placeholder="10"
                  />
                </Field>
              </ManagedForm>
            </div>
          </section>
          <section
            className="master-section"
            aria-labelledby="load-profile-title"
          >
            <div className="section-heading">
              <div>
                <h2 id="load-profile-title">Hồ sơ tải xe</h2>
                <p>
                  Chỉ phục vụ lập kế hoạch theo xe và vật liệu/nhóm vật liệu.
                </p>
              </div>
            </div>
            <div className="master-table-wrap" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Xe</th>
                    <th>Đối tượng</th>
                    <th>Sức chở kế hoạch</th>
                    <th>Phân loại</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.vehicleLoadProfiles.length ? (
                    data.vehicleLoadProfiles.map((item) => (
                      <tr key={item.id}>
                        <td>{item.vehicleName}</td>
                        <td>{item.targetName}</td>
                        <td>
                          <strong>
                            {item.plannedQuantity} {item.uomSymbol}
                          </strong>
                        </td>
                        <td>Lập kế hoạch</td>
                        <td>
                          <StatusText active={item.isActive} />
                        </td>
                        <td>
                          <ToggleButton
                            id={item.id}
                            isActive={item.isActive}
                            kind="vehicle-load-profile"
                            toggleKeys={toggleKeys}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow columns={6} label="Chưa có hồ sơ tải." />
                  )}
                </tbody>
              </table>
            </div>
            <ManagedForm
              initialKey={initialKeys["vehicle-load-profile"]}
              kind="vehicle-load-profile"
              title="Thêm hồ sơ tải kế hoạch"
            >
              <Field label="Phương tiện">
                <select name="vehicleId" required>
                  <option value="">Chọn xe</option>
                  {data.vehicles
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.plateNumber}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Vật liệu (chọn một trong hai)">
                <select name="materialId">
                  <option value="">Không chọn</option>
                  {data.materials
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Nhóm vật liệu (chọn một trong hai)">
                <select name="materialGroupId">
                  <option value="">Không chọn</option>
                  {data.materialGroups
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Sức chở kế hoạch">
                <input
                  inputMode="decimal"
                  name="plannedQuantity"
                  placeholder="9"
                  required
                />
              </Field>
              <Field label="Đơn vị kế hoạch">
                <select name="uomId" required>
                  <option value="">Chọn UOM</option>
                  {data.uoms
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.symbol} — {item.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Ghi chú" wide>
                <input
                  name="notes"
                  placeholder="Điều kiện đường, độ ẩm vật liệu…"
                />
              </Field>
            </ManagedForm>
          </section>
        </div>
      ) : null}

      {tab === "people" ? (
        <div className="master-tab-panel" role="tabpanel">
          <section className="master-section" aria-labelledby="people-title">
            <div className="section-heading">
              <span className="section-icon">
                <Users size={24} />
              </span>
              <div>
                <h2 id="people-title">Hồ sơ vận hành nhân viên</h2>
                <p>Tách thông tin vận hành khỏi vòng đời tài khoản P1.</p>
              </div>
            </div>
            <div className="master-table-wrap" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Mã</th>
                    <th>Chức danh</th>
                    <th>Kho chính</th>
                    <th>Trạng thái</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.employeeProfiles.length ? (
                    data.employeeProfiles.map((item) => (
                      <tr key={item.userId}>
                        <td>{item.displayName}</td>
                        <td>
                          <strong>{item.employeeCode}</strong>
                        </td>
                        <td>{item.jobTitle ?? "—"}</td>
                        <td>{item.homeWarehouseName ?? "—"}</td>
                        <td>
                          <StatusText active={item.isActive} />
                        </td>
                        <td>
                          <ToggleButton
                            id={item.userId}
                            isActive={item.isActive}
                            kind="employee-profile"
                            toggleKeys={toggleKeys}
                          />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <EmptyRow columns={6} label="Chưa có hồ sơ vận hành." />
                  )}
                </tbody>
              </table>
            </div>
            <ManagedForm
              initialKey={initialKeys["employee-profile"]}
              kind="employee-profile"
              title="Thêm hoặc cập nhật hồ sơ vận hành"
            >
              <Field label="Nhân viên">
                <select name="userId" required>
                  <option value="">Chọn nhân viên</option>
                  {data.employees.map((item) => (
                    <option key={item.userId} value={item.userId}>
                      {item.displayName} · {item.status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mã nhân viên">
                <input name="employeeCode" placeholder="EMP-001" required />
              </Field>
              <Field label="Chức danh">
                <input name="jobTitle" placeholder="Lái xe" />
              </Field>
              <Field label="Kho chính">
                <select name="homeWarehouseId">
                  <option value="">Không chọn</option>
                  {data.warehouses
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code} — {item.name}
                      </option>
                    ))}
                </select>
              </Field>
            </ManagedForm>
          </section>
          <section className="master-section" aria-labelledby="skills-title">
            <div className="section-heading">
              <div>
                <h2 id="skills-title">Năng lực người lao động</h2>
                <p>
                  Baseline kỹ năng để các phase điều phối sau có dữ liệu đáng
                  tin cậy.
                </p>
              </div>
            </div>
            <div className="two-table-grid">
              <div className="master-table-wrap" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Kỹ năng</th>
                      <th>Trạng thái</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workerSkills.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.code}</strong>
                          <small>{item.name}</small>
                        </td>
                        <td>
                          <StatusText active={item.isActive} />
                        </td>
                        <td>
                          <ToggleButton
                            id={item.id}
                            isActive={item.isActive}
                            kind="worker-skill"
                            toggleKeys={toggleKeys}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="master-table-wrap" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Kỹ năng</th>
                      <th>Mức</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workerSkillAssignments.length ? (
                      data.workerSkillAssignments.map((item) => (
                        <tr key={`${item.userId}:${item.skillId}`}>
                          <td>{item.displayName}</td>
                          <td>{item.skillName}</td>
                          <td>{item.level}</td>
                          <td>
                            <StatusText active={item.isActive} />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <EmptyRow columns={4} label="Chưa gán kỹ năng." />
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="form-stack">
              <ManagedForm
                initialKey={initialKeys["worker-skill"]}
                kind="worker-skill"
                title="Thêm hoặc cập nhật kỹ năng"
              >
                <Field label="Mã kỹ năng">
                  <input name="code" placeholder="FORKLIFT" required />
                </Field>
                <Field label="Tên kỹ năng">
                  <input name="name" placeholder="Vận hành xe nâng" required />
                </Field>
                <Field label="Mô tả" wide>
                  <input
                    name="description"
                    placeholder="Mô tả phạm vi năng lực"
                  />
                </Field>
              </ManagedForm>
              <ManagedForm
                initialKey={initialKeys["worker-skill-assignment"]}
                kind="worker-skill-assignment"
                title="Gán kỹ năng cho nhân viên"
              >
                <Field label="Nhân viên">
                  <select name="userId" required>
                    <option value="">Chọn nhân viên</option>
                    {data.employees.map((item) => (
                      <option key={item.userId} value={item.userId}>
                        {item.displayName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Kỹ năng">
                  <select name="skillId" required>
                    <option value="">Chọn kỹ năng</option>
                    {data.workerSkills
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Mức năng lực">
                  <select name="level" defaultValue="BASIC">
                    <option value="BASIC">Cơ bản</option>
                    <option value="QUALIFIED">Đạt yêu cầu</option>
                    <option value="ADVANCED">Nâng cao</option>
                    <option value="EXPERT">Chuyên gia</option>
                  </select>
                </Field>
              </ManagedForm>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
