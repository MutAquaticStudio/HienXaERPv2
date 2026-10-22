"use client";

import { startTransition, useActionState, useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { DocumentLineTable } from "@/components/documents/editor/document-line-table";
import { DocumentTotalValue } from "@/components/documents/editor/document-total";
import { EntityCombobox } from "@/components/documents/editor/entity-combobox";
import { addMaterialLine, MAX_DOCUMENT_LINES } from "@/components/documents/editor/lines";
import { MaterialSearchBox, type MaterialSearchHandle } from "@/components/documents/editor/material-search-box";
import type { EditorLine, EditorMaterial, EntityOption } from "@/components/documents/editor/types";
import { useAutoPricePreview } from "@/components/documents/editor/use-auto-price-preview";
import { Dialog } from "@/components/ui/dialog";
import { formatQuantity } from "@/lib/core/quantity";
import { priceSourceLabel } from "@/modules/pricing/presentation";
import { userFacingError } from "@/lib/core/errors";
import { formatVnd, vnd } from "@/lib/core/money";
import { isPositiveSalesQuantity } from "@/modules/sales/quantity-input";
import { createPurchaseOrderAction, createSupplierQuickAction, previewWarehousePurchaseAction, searchPurchaseSuppliersAction, updatePurchaseOrderDraftAction, updatePurchaseWarehouseAddressAction, updatePurchaseDraftDestinationAction, type CostPreviewResult } from "@/modules/purchasing/actions";
import { normalizeWarehouseAddress, warehouseAddressRequired } from "@/modules/purchasing/warehouse-address";
import type { PurchaseFormOptions, SalesLineContext, SalesOrderPurchaseLine } from "@/modules/purchasing/form-options";
import { MoneyInput } from "@/components/ui/money-input";

export type ExistingPurchaseDraft = {
  id: string; version: number; supplierId: string; warehouseId: string | null;
  destinationType: "WAREHOUSE" | "CUSTOMER_SITE"; sourceSalesOrderId: string | null;
  expectedAt: string | null; terms: string | null; destinationAddress: string;
  lines: { sourceLineId: string; salesLineId: string; materialId: string; uomId: string;
    quantity: string; manualCostVnd: string; manualCostReason: string }[];
};

/** manualPriceVnd/manualReason hold the purchase cost override (posted as manualCostVnd/manualCostReason). */
type PurchaseLine = EditorLine & { salesLineId: string; manualSalesPriceVnd: string; manualSalesReason: string };
const COST_FIELDS = { uom: "orderedUomId", price: "manualCostVnd", reason: "manualCostReason" };
const PREVIEW_FAILURE: CostPreviewResult = { success: false, message: "Không thể xem trước giá mua." };

function localDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(" ", "T");
}

function QuickSupplierPanel({ onCreated, onClose }: { onCreated: (supplier: EntityOption) => void; onClose: () => void }) {
  const operationId = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    data.set("operationId", operationId.current);
    setPending(true);
    try {
      const result = await createSupplierQuickAction(undefined, data);
      if (!result?.success || !result.supplierId) { setMessage(result?.message ?? "Không thể tạo nhà cung cấp."); return; }
      onCreated({ id: result.supplierId, label: String(data.get("name") ?? "").trim() });
    } catch { setMessage("Chưa xác định kết quả. Bấm tạo lại để kiểm tra; hệ thống không tạo trùng."); }
    finally { setPending(false); }
  }
  return <Dialog eyebrow="Tạo nhanh trong mua hàng" title="Thêm nhà cung cấp" onClose={onClose} initialFocusId="quick-supplier-code"
    description="Đơn mua đang soạn được giữ nguyên. Nhà cung cấp mới sẽ được chọn tự động.">
    <form onSubmit={submit} className="form-grid">
      <div className="field"><label htmlFor="quick-supplier-code">Mã NCC *</label><input id="quick-supplier-code" name="code" required pattern="[A-Za-z0-9_\-]{2,32}" maxLength={32} /></div>
      <div className="field"><label htmlFor="quick-supplier-name">Tên NCC *</label><input id="quick-supplier-name" name="name" required minLength={2} maxLength={160} /></div>
      <div className="field"><label htmlFor="quick-supplier-phone">Điện thoại</label><input id="quick-supplier-phone" name="phone" maxLength={40} /></div>
      {message && <p className="form-message field-full" role="status">{userFacingError(message)}</p>}
      <div className="form-actions field-full"><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang tạo..." : "Tạo nhà cung cấp"}</button></div>
    </form>
  </Dialog>;
}

export function PurchaseOrderForm({ options, operationId, confirmOperationId, canConfirm = false, salesLine, sourceLines, canCreateSales, canManagePrice, canReadPrice, canManageSalesPrice = false, canManageWarehouse = false, existing, initialSupplierId, initialWarehouseId, initialMaterialId }: {
  options: PurchaseFormOptions; operationId: string; confirmOperationId?: string; canConfirm?: boolean; salesLine?: SalesLineContext | null;
  sourceLines?: SalesOrderPurchaseLine[];
  canCreateSales: boolean; canManagePrice: boolean; canReadPrice: boolean; canManageSalesPrice?: boolean; canManageWarehouse?: boolean; existing?: ExistingPurchaseDraft;
  initialSupplierId?: string; initialWarehouseId?: string; initialMaterialId?: string;
}) {
  const [state, action, pending] = useActionState(existing ? updatePurchaseOrderDraftAction : createPurchaseOrderAction, undefined);
  const [mode, setMode] = useState<"WAREHOUSE" | "LINKED_DIRECT">(salesLine || existing?.destinationType === "CUSTOMER_SITE" ? "LINKED_DIRECT" : "WAREHOUSE");
  const supplierOptions = useMemo(() => options.suppliers.map((item) => ({ id: item.id, label: item.name })), [options.suppliers]);
  const startSupplier = supplierOptions.find((item) => item.id === (existing?.supplierId ?? initialSupplierId)) ?? null;
  const [supplier, setSupplier] = useState<EntityOption | null>(startSupplier);
  const [supplierChoices, setSupplierChoices] = useState<EntityOption[]>(supplierOptions);
  const [quickSupplier, setQuickSupplier] = useState(false);
  const supplierId = supplier?.id ?? "";
  const initialWarehouse = options.warehouses.find((item) => item.id === initialWarehouseId) ?? options.warehouses[0];
  const [warehouseId, setWarehouseId] = useState(existing?.warehouseId ?? initialWarehouse?.id ?? "");
  const [warehouseAddresses, setWarehouseAddresses] = useState<Record<string, string>>({});
  const selectedWarehouse = options.warehouses.find((row) => row.id === warehouseId);
  const selectedAddress = warehouseId in warehouseAddresses ? warehouseAddresses[warehouseId] : selectedWarehouse?.address ?? null;
  const addressMissing = !normalizeWarehouseAddress(selectedAddress);
  const [documentVersion, setDocumentVersion] = useState(existing?.version ?? 1);
  const [committedWarehouseId, setCommittedWarehouseId] = useState(existing?.warehouseId ?? "");
  const [snapshotAddress, setSnapshotAddress] = useState(existing?.destinationAddress ?? "");
  const [addressInput, setAddressInput] = useState("");
  const [warehousePending, setWarehousePending] = useState(false);
  const [warehouseMessage, setWarehouseMessage] = useState("");
  const destinationIntent = useRef<{ payload: string; operationId: string } | null>(null);
  const customerOptions = useMemo(() => options.customers.map((item) => ({ id: item.id, label: item.name })), [options.customers]);
  const [customer, setCustomer] = useState<EntityOption | null>(null);
  const [site, setSite] = useState<EntityOption | null>(null);
  const customerId = customer?.id ?? "";
  const sites = useMemo(() => (options.customers.find((row) => row.id === customerId)?.sites ?? []).map((item) => ({ id: item.id, label: item.name, detail: item.address })), [customerId, options.customers]);

  const sourceMode = !!salesLine || existing?.destinationType === "CUSTOMER_SITE";
  const availableSourceLines = useMemo(() => sourceLines ?? salesLine?.availableLines ?? [], [sourceLines, salesLine]);
  const selectedSource = salesLine?.availableLines.find((line) => line.id === salesLine.id);
  const startMaterial = initialMaterialId ? options.materials.find((item) => item.id === initialMaterialId) : undefined;
  const blank = { sourceLineId: "", salesLineId: "", manualPriceVnd: "", manualReason: "", manualSalesPriceVnd: "", manualSalesReason: "" };
  const [lines, setLines] = useState<PurchaseLine[]>(() => existing
    ? existing.lines.map((line, key) => ({ key, sourceLineId: line.sourceLineId, salesLineId: line.salesLineId, materialId: line.materialId, uomId: line.uomId, quantity: line.quantity,
      manualPriceVnd: line.manualCostVnd, manualReason: canManagePrice ? line.manualCostReason : "", manualSalesPriceVnd: "", manualSalesReason: "" }))
    : selectedSource ? [{ ...blank, key: 0, salesLineId: selectedSource.id, materialId: selectedSource.materialId, uomId: selectedSource.uomId, quantity: selectedSource.remainingOrderedQuantity }]
    : startMaterial ? [{ ...blank, key: 0, materialId: startMaterial.id, uomId: startMaterial.uoms[0]?.id ?? "", quantity: "1" }] : []);
  const nextLineKey = useRef(Math.max(1, lines.length));
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const searchRef = useRef<MaterialSearchHandle>(null);

  const warehouseMode = mode === "WAREHOUSE";
  const createsSales = !warehouseMode && !sourceMode;
  const emptyLines = !supplierId || !lines.length || lines.some((line) => !line.materialId || !line.uomId || !isPositiveSalesQuantity(line.quantity) || (sourceMode && !line.salesLineId));
  const disabled = emptyLines || (warehouseMode ? !warehouseId || (!existing && addressMissing) || (!!existing && warehouseId !== committedWarehouseId) : sourceMode ? !availableSourceLines.length : !canCreateSales || !site);
  const previewNeeded = canReadPrice || createsSales;
  const priceMissing = !supplierId ? "Chọn nhà cung cấp để tính giá"
    : createsSales && !site ? "Chọn khách hàng và công trình để tính giá"
    : !lines.length ? "Thêm vật tư để tính giá"
    : emptyLines ? "Sửa dòng hàng chưa hợp lệ để tính giá" : null;

  const load = useCallback(() => previewWarehousePurchaseAction({ mode, supplierId, warehouseId: warehouseMode ? warehouseId : undefined,
    customerId: createsSales ? customerId : undefined,
    salesOrderId: existing?.sourceSalesOrderId ?? salesLine?.orderId ?? undefined,
    documentId: existing?.id, expectedVersion: existing ? documentVersion : undefined, expectedAt: "", terms: "", operationId,
    lines: lines.map((line) => ({ materialId: line.materialId, orderedUomId: line.uomId, quantity: line.quantity,
      manualCostVnd: line.manualPriceVnd, manualCostReason: line.manualReason,
      manualSalesPriceVnd: line.manualSalesPriceVnd, manualSalesReason: line.manualSalesReason,
      sourceLineId: line.sourceLineId || undefined, salesLineId: line.salesLineId || undefined })) }),
  [mode, supplierId, warehouseMode, warehouseId, createsSales, customerId, existing, salesLine, documentVersion, operationId, lines]);
  const scope = useMemo(() => ({ state, supplierId }), [state, supplierId]);
  const { preview, pending: previewPending, invalidate } = useAutoPricePreview({ load, scope, failure: PREVIEW_FAILURE, holdUntilChange: !!existing,
    enabled: previewNeeded && !disabled && !pending && !warehousePending && !state?.partialPurchaseOrderId });

  function changeLines(next: (current: PurchaseLine[]) => PurchaseLine[]) {
    invalidate();
    setLines(next);
  }
  function pickMaterial(material: EditorMaterial) {
    const result = addMaterialLine(lines, material, nextLineKey.current);
    if (!result) { setWarehouseMessage(`Đơn mua tối đa ${MAX_DOCUMENT_LINES} dòng.`); return; }
    if (result.focusKey === nextLineKey.current) nextLineKey.current += 1;
    changeLines(() => result.lines.map((line) => ({ ...blank, ...line })) as PurchaseLine[]);
    setFocusKey(result.focusKey);
    setFocusSeq((seq) => seq + 1);
  }
  const unusedSourceLines = availableSourceLines.filter((item) => Number(item.remainingOrderedQuantity) > 0 && !lines.some((line) => line.salesLineId === item.id));
  function addSourceLine(option: EntityOption | null) {
    const source = availableSourceLines.find((item) => item.id === option?.id);
    if (!source || lines.length >= MAX_DOCUMENT_LINES) return;
    const key = nextLineKey.current++;
    changeLines((current) => [...current, { ...blank, key, salesLineId: source.id, materialId: source.materialId, uomId: source.uomId, quantity: source.remainingOrderedQuantity }]);
    setFocusKey(key);
  }

  async function saveWarehouseAddress() {
    if (warehousePending || pending) return;
    const target = warehouseId;
    setWarehousePending(true);
    try {
      const result = await updatePurchaseWarehouseAddressAction({ warehouseId: target, address: addressInput, expectedAddress: selectedAddress, operationId: crypto.randomUUID() });
      setWarehouseMessage(result.message);
      if (result.success && result.address) setWarehouseAddresses((current) => ({ ...current, [target]: result.address! }));
    } catch { setWarehouseMessage("Không thể cập nhật địa chỉ kho. Nội dung đơn mua được giữ nguyên."); }
    finally { setWarehousePending(false); }
  }
  async function refreshDraftDestination() {
    if (!existing || warehousePending || pending || addressMissing) return;
    const payload = JSON.stringify({ documentId: existing.id, expectedVersion: documentVersion, warehouseId });
    if (destinationIntent.current && destinationIntent.current.payload !== payload) {
      setWarehouseMessage("Thao tác trước chưa rõ kết quả. Giữ nội dung và thử lại cùng dữ liệu hoặc tải lại đơn mua trước khi đổi yêu cầu."); return;
    }
    const intent = destinationIntent.current ?? { payload, operationId: crypto.randomUUID() };
    destinationIntent.current = intent;
    setWarehousePending(true);
    try {
      const result = await updatePurchaseDraftDestinationAction({ documentId: existing.id, expectedVersion: documentVersion, warehouseId, operationId: intent.operationId });
      setWarehouseMessage(result.message);
      if (result.success && result.version && result.warehouseId && result.address) {
        setDocumentVersion(result.version); setCommittedWarehouseId(result.warehouseId); setSnapshotAddress(result.address); destinationIntent.current = null; invalidate();
      }
    } catch { setWarehouseMessage("Chưa xác định được kết quả cập nhật. Giữ nội dung và thử lại cùng thao tác."); }
    finally { setWarehousePending(false); }
  }

  const blocked = pending || warehousePending || disabled || !!state?.partialPurchaseOrderId || (previewNeeded && !preview?.success) || (createsSales && !preview?.sales);
  const confirmable = !existing && warehouseMode && canConfirm && !!confirmOperationId;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name === "intent") data.set("intent", submitter.value);
    startTransition(() => action(data));
  }

  const draftLabel = existing ? "Lưu thay đổi đơn mua nháp" : salesLine ? "Lưu đơn mua giao thẳng" : mode === "LINKED_DIRECT" ? "Lưu đơn mua và bản nháp bán" : "Lưu nháp";
  return <><form className="doc-editor purchase-order-form" onSubmit={submit}>
    <input type="hidden" name="operationId" value={operationId} />
    {confirmable && <input type="hidden" name="confirmOperationId" value={confirmOperationId} />}
    <input type="hidden" name="mode" value={mode} />
    {existing && <><input type="hidden" name="documentId" value={existing.id} /><input type="hidden" name="expectedVersion" value={documentVersion} /></>}
    {(salesLine?.orderId || existing?.sourceSalesOrderId) && <input type="hidden" name="salesOrderId" value={salesLine?.orderId ?? existing?.sourceSalesOrderId ?? ""} />}
    <input type="hidden" name="salesPreview" value={preview?.success && preview.sales ? JSON.stringify(preview.sales.lines) : ""} />
    <input type="hidden" name="costPreview" value={preview?.success ? JSON.stringify(preview.lines) : ""} />

    <section className="card doc-editor-main" aria-label="Dòng mua">
      {salesLine && <section className="context-strip"><strong>{salesLine.orderNumber} · {salesLine.materialName}</strong><span>{salesLine.customerName} · {salesLine.siteName}</span><span>Còn thiếu nguồn: {formatQuantity(salesLine.remainingOrderedQuantity)} {salesLine.orderedUomSymbol}</span></section>}
      {sourceMode
        ? <EntityCombobox label="Thêm dòng từ đơn bán" name="" value={null} disabled={!unusedSourceLines.length}
          placeholder={unusedSourceLines.length ? "Chọn dòng đơn bán còn thiếu nguồn" : "Đã gắn hết các dòng còn thiếu nguồn"}
          options={unusedSourceLines.map((item) => ({ id: item.id, label: item.materialName, detail: `Còn ${formatQuantity(item.remainingOrderedQuantity)} ${item.uomSymbol}` }))}
          onSelect={addSourceLine} />
        : <MaterialSearchBox ref={searchRef} materials={options.materials} onPick={pickMaterial} disabled={!options.materials.length} />}
      <DocumentLineTable<PurchaseLine> lines={lines} materials={options.materials} canManagePrice={canManagePrice} isValidQuantity={isPositiveSalesQuantity} focusKey={focusKey} focusSeq={focusSeq}
        fields={COST_FIELDS} labels={{ uom: "ĐVT mua", price: "Giá mua" }} lockedMaterial={() => sourceMode}
        emptyText={sourceMode ? "Chưa có dòng mua. Chọn dòng đơn bán ở ô phía trên." : undefined}
        priced={(index) => canReadPrice && preview?.success && preview.lines?.[index] ? { unitPriceVnd: preview.lines[index].unitCostVnd, lineTotalVnd: preview.lines[index].lineTotalVnd, sourceLabel: priceSourceLabel(preview.lines[index].priceSourceType) } : null}
        onChange={(key, change) => changeLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line))}
        onRemove={(key) => { changeLines((current) => current.filter((line) => line.key !== key)); searchRef.current?.focus(); }}
        onDone={() => searchRef.current?.focus()}
        hiddenFields={(line) => <input type="hidden" name="salesLineId" value={line.salesLineId} />}
        detail={createsSales ? (line, index) => <>
          {canManageSalesPrice && <span className="doc-editor-reason"><label>Giá bán thủ công dòng {index + 1}<MoneyInput value={line.manualSalesPriceVnd} onValue={(manualSalesPriceVnd) => changeLines((current) => current.map((item) => item.key === line.key ? { ...item, manualSalesPriceVnd } : item))} /></label>
            <input type="hidden" name="manualSalesPriceVnd" value={line.manualSalesPriceVnd} />
            {line.manualSalesPriceVnd && <label>Ghi chú giá bán dòng {index + 1} (không bắt buộc)<input name="manualSalesReason" maxLength={500} value={line.manualSalesReason} onChange={(event) => changeLines((current) => current.map((item) => item.key === line.key ? { ...item, manualSalesReason: event.target.value } : item))} /></label>}
            {!line.manualSalesPriceVnd && <input type="hidden" name="manualSalesReason" value="" />}</span>}
          {preview?.success && preview.sales?.lines[index] && <small className="muted">Giá bán khách: <strong>{formatVnd(vnd(preview.sales.lines[index].unitPriceVnd))}</strong> · {priceSourceLabel(preview.sales.lines[index].priceSourceType)} · Thành tiền bán: <strong>{formatVnd(vnd(preview.sales.lines[index].lineTotalVnd))}</strong></small>}
        </> : undefined} />
    </section>

    <div className="doc-editor-rail"><aside className="card card-pad doc-editor-side" aria-label="Thông tin đơn mua">
      <EntityCombobox label="Nhà cung cấp" name="supplierId" value={supplier} options={supplierChoices} readOnly={!!existing} placeholder="Tìm NCC theo mã hoặc tên"
        onSearch={async (term) => { const found = (await searchPurchaseSuppliersAction(term)).suppliers.map((item) => ({ id: item.id, label: item.name })); setSupplierChoices((current) => [...current, ...found.filter((item) => !current.some((row) => row.id === item.id))]); return found; }}
        onSelect={(option) => { setSupplier(option); invalidate(); }}
        action={!existing ? <button type="button" className="quick-create-trigger" onClick={() => setQuickSupplier(true)}>+ Thêm NCC</button> : undefined} />
      {!existing && !salesLine && <div className="field"><label htmlFor="mode">Giao đến</label><select id="mode" value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); invalidate(); }}><option value="WAREHOUSE">Kho Hiền Xa</option><option value="LINKED_DIRECT" disabled={!canCreateSales}>Giao thẳng khách · tạo bản nháp bán liên kết</option></select></div>}
      {warehouseMode && <div className="field"><label htmlFor="warehouseId">Kho nhận</label><select id="warehouseId" name="warehouseId" value={warehouseId} disabled={warehousePending || pending} onChange={(event) => { setWarehouseId(event.target.value); setWarehouseMessage(""); setAddressInput(""); }} required>{options.warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select>
        <small className="muted">Địa chỉ kho: {normalizeWarehouseAddress(selectedAddress) ?? "Chưa được bổ sung"}</small>
        {addressMissing && <><p role="alert" className="form-message">{warehouseAddressRequired}</p>{!canManageWarehouse && <p className="muted">Vui lòng liên hệ người phụ trách có quyền sửa kho để bổ sung địa chỉ. Nội dung đơn mua được giữ nguyên.</p>}</>}
        {canManageWarehouse && addressMissing && <details><summary>Bổ sung địa chỉ kho</summary><label htmlFor="warehouseAddress">Địa chỉ kho</label><textarea id="warehouseAddress" value={addressInput} maxLength={2000} onChange={(event) => setAddressInput(event.target.value)} /><button type="button" className="button button-secondary" disabled={pending || warehousePending || !normalizeWarehouseAddress(addressInput)} onClick={saveWarehouseAddress}>Lưu địa chỉ kho</button></details>}
        {existing && <><p>Địa chỉ nhận đã lưu trên đơn mua: {normalizeWarehouseAddress(snapshotAddress) ?? "Còn thiếu — cần cập nhật trước khi xác nhận"}</p><button type="button" className="button button-secondary" disabled={pending || warehousePending || addressMissing} onClick={refreshDraftDestination}>{warehouseId === committedWarehouseId ? "Cập nhật địa chỉ từ kho" : "Áp dụng kho nhận"}</button>{warehouseId !== committedWarehouseId && <p role="alert">Bấm áp dụng kho nhận trước khi lưu thay đổi đơn mua.</p>}</>}
        {warehouseMessage && <p role="status" className="form-message">{warehouseMessage}</p>}
      </div>}
      {createsSales && <>
        <EntityCombobox label="Khách hàng" name="customerId" value={customer} options={customerOptions} placeholder="Tìm khách hàng" onSelect={(option) => { setCustomer(option); setSite(null); invalidate(); }} />
        <EntityCombobox label="Công trình" name="siteId" value={site} options={sites} disabled={!customerId} placeholder={customerId ? "Chọn công trình giao hàng" : "Chọn khách hàng trước"} emptyText="Khách chưa có công trình." onSelect={(option) => { setSite(option); invalidate(); }} />
      </>}
      {mode === "LINKED_DIRECT" && !salesLine && <p className="mock-banner">{existing ? "Lưu cập nhật đơn mua nháp này; không tạo đơn mua hoặc đơn bán mới. Đơn bán liên kết được giữ nguyên." : "Giá mua được lưu trên đơn mua. Gắn đơn bán có sẵn sẽ giữ nguyên giá bán; chọn tạo đơn bán liên kết sẽ lưu hai bản nháp cùng lúc."}</p>}
    </aside>

    <div className="card card-pad doc-editor-footer" role="group" aria-label="Tổng tiền và lưu đơn mua">
      {preview && !preview.success && <p role="status" className="form-message">{userFacingError(preview.message)}</p>}
      {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{userFacingError(state.message)}</p>}
      {state?.partialPurchaseOrderId && <Link className="button button-secondary" href={`/admin/purchase-orders/${state.partialPurchaseOrderId}/edit`}>Mở đơn mua nháp đã tạo</Link>}
      <div className="doc-editor-totals"><dl className="doc-editor-summary">
        <div><dt>Số dòng</dt><dd>{lines.length}</dd></div>
        {canReadPrice
          ? <div className="doc-editor-total"><dt>Tổng tiền hàng</dt><dd><DocumentTotalValue totalVnd={preview?.success ? preview.totalVnd : null} pending={previewPending && !priceMissing} /></dd></div>
          : <p className="muted">Giá mua được giữ ẩn theo quyền. Hệ thống vẫn kiểm tra giá khi lưu.</p>}
        {createsSales && preview?.success && preview.sales && <div><dt>Tổng giá bán khách</dt><dd>{formatVnd(vnd(preview.sales.totalVnd))}</dd></div>}
      </dl>
      {canReadPrice && priceMissing && <p className="doc-editor-total-hint">{priceMissing}</p>}</div>
      <div className="doc-editor-actions">
        {confirmable && <button className="button button-primary" type="submit" name="intent" value="confirm" disabled={blocked}>{pending ? "Đang lưu..." : "Tạo đơn mua"}</button>}
        <button className={`button ${confirmable ? "button-secondary" : "button-primary"}`} type="submit" name="intent" value="draft" disabled={blocked}>{pending && !confirmable ? "Đang lưu..." : draftLabel}</button>
      </div>
      {confirmable && <p className="muted doc-editor-hint">“Tạo đơn mua” lưu và xác nhận ngay; “Lưu nháp” để sửa tiếp sau.</p>}
    </div>

    <div className="card card-pad doc-editor-extra" role="group" aria-label="Ngày dự kiến và điều khoản">
      <div className="field"><label htmlFor="expectedAt">Ngày dự kiến</label><input id="expectedAt" name="expectedAt" type="datetime-local" defaultValue={localDateTime(existing?.expectedAt ?? null)} /></div>
      <div className="field"><label htmlFor="terms">Điều khoản mua</label><textarea id="terms" name="terms" rows={2} maxLength={1000} defaultValue={existing?.terms ?? ""} /></div>
    </div></div>
  </form>{quickSupplier && <QuickSupplierPanel onClose={() => setQuickSupplier(false)}
    onCreated={(created) => { setSupplierChoices((current) => [...current, created]); setSupplier(created); invalidate(); setQuickSupplier(false); }} />}</>;
}
