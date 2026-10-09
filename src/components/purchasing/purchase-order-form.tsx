"use client";

import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatVnd, vnd } from "@/lib/core/money";
import { createPurchaseOrderAction, previewWarehousePurchaseAction, searchPurchaseSuppliersAction, updatePurchaseOrderDraftAction, updatePurchaseWarehouseAddressAction, updatePurchaseDraftDestinationAction, type CostPreviewResult } from "@/modules/purchasing/actions";
import { normalizeWarehouseAddress, warehouseAddressRequired } from "@/modules/purchasing/warehouse-address";
import type { PurchaseFormOptions, SalesLineContext, SalesOrderPurchaseLine } from "@/modules/purchasing/form-options";

export type ExistingPurchaseDraft = {
  id: string; version: number; supplierId: string; warehouseId: string | null;
  destinationType: "WAREHOUSE" | "CUSTOMER_SITE"; sourceSalesOrderId: string | null;
  expectedAt: string | null; terms: string | null; destinationAddress: string;
  lines: { sourceLineId: string; salesLineId: string; materialId: string; uomId: string;
    quantity: string; manualCostVnd: string; manualCostReason: string }[];
};

function localDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(" ", "T");
}

export function PurchaseOrderForm({ options, operationId, salesLine, sourceLines, canCreateSales, canManagePrice, canReadPrice, canManageSalesPrice = false, canManageWarehouse = false, existing, initialSupplierId, initialWarehouseId, initialMaterialId }: {
  options: PurchaseFormOptions; operationId: string; salesLine?: SalesLineContext | null;
  sourceLines?: SalesOrderPurchaseLine[];
  canCreateSales: boolean; canManagePrice: boolean; canReadPrice: boolean; canManageSalesPrice?: boolean; canManageWarehouse?: boolean; existing?: ExistingPurchaseDraft;
  initialSupplierId?: string; initialWarehouseId?: string; initialMaterialId?: string;
}) {
  const [state, action, pending] = useActionState(existing ? updatePurchaseOrderDraftAction : createPurchaseOrderAction, undefined);
  const [mode, setMode] = useState<"WAREHOUSE" | "LINKED_DIRECT">(salesLine || existing?.destinationType === "CUSTOMER_SITE" ? "LINKED_DIRECT" : "WAREHOUSE");
  const initialSupplier = initialSupplierId ? options.suppliers.find((item) => item.id === initialSupplierId) : options.suppliers[0];
  const initialWarehouse = options.warehouses.find((item) => item.id === initialWarehouseId) ?? options.warehouses[0];
  const initialMaterial = options.materials.find((item) => item.id === initialMaterialId) ?? options.materials[0];
  const [supplierSelection, setSupplierSelection] = useState({ context: initialSupplierId,
    supplier: existing ? options.suppliers.find((item) => item.id === existing.supplierId) : initialSupplier });
  if (!existing && supplierSelection.context !== initialSupplierId) {
    setSupplierSelection({ context: initialSupplierId, supplier: initialSupplier });
  }
  const supplierId = supplierSelection.supplier?.id ?? "";
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierLookup, setSupplierLookup] = useState<{ query: string; suppliers: PurchaseFormOptions["suppliers"]; message: string } | null>(null);
  const [supplierLookupPending, setSupplierLookupPending] = useState(false);
  const matchingSuppliers = supplierLookup?.query === supplierSearch.trim() ? supplierLookup.suppliers : options.suppliers;
  const supplierRows = supplierSelection.supplier && !matchingSuppliers.some((item) => item.id === supplierId)
    ? [supplierSelection.supplier, ...matchingSuppliers] : matchingSuppliers;
  async function findSuppliers() {
    const query = supplierSearch.trim();
    setSupplierLookupPending(true);
    try { setSupplierLookup({ query, ...await searchPurchaseSuppliersAction(query) }); }
    catch { setSupplierLookup({ query, suppliers: [], message: "Không thể tìm nhà cung cấp. Hãy thử lại." }); }
    finally { setSupplierLookupPending(false); }
  }
  const [warehouseId, setWarehouseId] = useState(existing?.warehouseId ?? initialWarehouse?.id ?? "");
  const [warehouseAddresses, setWarehouseAddresses] = useState<Record<string, string>>({});
  const selectedWarehouse = options.warehouses.find((row) => row.id === warehouseId);
  const selectedAddress = warehouseId in warehouseAddresses ? warehouseAddresses[warehouseId] : selectedWarehouse?.address ?? null;
  const addressMissing = !normalizeWarehouseAddress(selectedAddress);
  const [documentVersion, setDocumentVersion] = useState(existing?.version ?? 1);
  const [committedWarehouseId, setCommittedWarehouseId] = useState(existing?.warehouseId ?? "");
  const [snapshotAddress, setSnapshotAddress] = useState(existing?.destinationAddress ?? "");
  const [addressInput, setAddressInput] = useState("");
  const [addressReason, setAddressReason] = useState("");
  const [destinationReason, setDestinationReason] = useState("");
  const [warehousePending, setWarehousePending] = useState(false);
  const [warehouseMessage, setWarehouseMessage] = useState("");
  const destinationIntent = useRef<{ payload: string; operationId: string } | null>(null);
  const [customerId, setCustomerId] = useState(options.customers[0]?.id ?? "");
  const selectedSource = salesLine?.availableLines.find((line) => line.id === salesLine.id);
  const [lines, setLines] = useState(existing ? existing.lines.map((line, key) => ({ ...line, key, manualSalesPriceVnd: "", manualSalesReason: "" })) : [{ key: 0,
    sourceLineId: "", salesLineId: selectedSource?.id ?? "", materialId: selectedSource?.materialId ?? initialMaterial?.id ?? "",
    uomId: selectedSource?.uomId ?? initialMaterial?.uoms[0]?.id ?? "",
    quantity: selectedSource?.remainingOrderedQuantity ?? "", manualCostVnd: "", manualCostReason: "", manualSalesPriceVnd: "", manualSalesReason: "" }]);
  const nextLineKey = useRef(existing?.lines.length ?? 1);
  const priceRevision = useRef(0);
  const [previewRecord, setPreviewRecord] = useState<{ state: typeof state; supplierId: string; value: CostPreviewResult } | null>(null);
  const preview = previewRecord?.state === state && previewRecord?.supplierId === supplierId ? previewRecord.value : null;
  const setPreview = useCallback((next: CostPreviewResult | null) => { setPreviewRecord(next ? { state, supplierId, value: next } : null); }, [state, supplierId]);
  const [previewPending, setPreviewPending] = useState(false);
  const sites = useMemo(() => options.customers.find((row) => row.id === customerId)?.sites ?? [], [customerId, options.customers]);
  const sourceMode = !!salesLine || existing?.destinationType === "CUSTOMER_SITE";
  const availableSourceLines = sourceLines ?? salesLine?.availableLines ?? [];
  const warehouseMode = mode === "WAREHOUSE";
  const createsSales = !warehouseMode && !sourceMode;
  const emptyLines = !supplierId || !options.materials.length || lines.some((line) => !line.materialId || !line.uomId || !line.quantity || (sourceMode && !line.salesLineId));
  const disabled = emptyLines || (warehouseMode ? !warehouseId || (!existing && addressMissing) || (!!existing && warehouseId !== committedWarehouseId) : sourceMode ? !availableSourceLines.length : !canCreateSales || !sites.length);
  function invalidatePrice() { priceRevision.current += 1; setPreview(null); setPreviewPending(false); }
  function updateLine(key: number, change: Partial<(typeof lines)[number]>) {
    invalidatePrice();
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
  }
  function addLine() {
    if (lines.length >= 50 || !options.materials.length) return;
    const source = sourceMode ? availableSourceLines.find((line) => Number(line.remainingOrderedQuantity) > 0 && !lines.some((entry) => entry.salesLineId === line.id)) : null;
    if (sourceMode && !source) return;
    const material = options.materials[0];
    invalidatePrice();
    setLines((current) => [...current, { key: nextLineKey.current++, sourceLineId: "", salesLineId: source?.id ?? "",
      materialId: source?.materialId ?? material.id, uomId: source?.uomId ?? material.uoms[0]?.id ?? "",
      quantity: source?.remainingOrderedQuantity ?? "", manualCostVnd: "", manualCostReason: "", manualSalesPriceVnd: "", manualSalesReason: "" }]);
  }
  const loadPreview = useCallback(async () => {
    if (emptyLines) { setPreview({ success: false, message: "Nhập đủ các dòng mua trước khi xem giá." }); return; }
    const revision = ++priceRevision.current;
    setPreviewPending(true);
    try {
      const result = await previewWarehousePurchaseAction({ mode, supplierId, warehouseId: warehouseMode ? warehouseId : undefined,
        customerId: !sourceMode && !warehouseMode ? customerId : undefined,
        salesOrderId: existing?.sourceSalesOrderId ?? salesLine?.orderId ?? undefined,
        documentId: existing?.id, expectedVersion: existing ? documentVersion : undefined, expectedAt: "", terms: "", operationId,
        lines: lines.map((line) => ({ materialId: line.materialId, orderedUomId: line.uomId, quantity: line.quantity,
          manualCostVnd: line.manualCostVnd, manualCostReason: line.manualCostReason,
          manualSalesPriceVnd: line.manualSalesPriceVnd, manualSalesReason: line.manualSalesReason,
          sourceLineId: line.sourceLineId || undefined, salesLineId: line.salesLineId || undefined })) });
      if (revision === priceRevision.current) setPreview(result);
    } catch { if (revision === priceRevision.current) setPreview({ success: false, message: "Không thể xem trước giá mua." }); }
    finally { if (revision === priceRevision.current) setPreviewPending(false); }
  }, [emptyLines, setPreview, mode, supplierId, warehouseMode, warehouseId, sourceMode, customerId, existing, salesLine, documentVersion, operationId, lines]);
  useEffect(() => {
    if ((!canReadPrice && !createsSales) || disabled || pending || warehousePending || state?.partialPurchaseOrderId || (existing && priceRevision.current === 0)) return;
    const timer = setTimeout(() => { void loadPreview(); }, 250);
    return () => { clearTimeout(timer); priceRevision.current += 1; };
  }, [canReadPrice, createsSales, disabled, pending, warehousePending, state?.partialPurchaseOrderId, existing, loadPreview]);
  async function saveWarehouseAddress() {
    if (warehousePending || pending) return;
    const target = warehouseId;
    setWarehousePending(true);
    try {
      const result = await updatePurchaseWarehouseAddressAction({ warehouseId: target, address: addressInput, expectedAddress: selectedAddress, reason: addressReason, operationId: crypto.randomUUID() });
      setWarehouseMessage(result.message);
      if (result.success && result.address) setWarehouseAddresses((current) => ({ ...current, [target]: result.address! }));
    } catch { setWarehouseMessage("Không thể cập nhật địa chỉ kho. Nội dung đơn mua được giữ nguyên."); }
    finally { setWarehousePending(false); }
  }
  async function refreshDraftDestination() {
    if (!existing || warehousePending || pending || addressMissing) return;
    const payload = JSON.stringify({ documentId: existing.id, expectedVersion: documentVersion, warehouseId, reason: destinationReason });
    if (destinationIntent.current && destinationIntent.current.payload !== payload) {
      setWarehouseMessage("Thao tác trước chưa rõ kết quả. Giữ nội dung và thử lại cùng dữ liệu hoặc tải lại PO trước khi đổi yêu cầu."); return;
    }
    const intent = destinationIntent.current ?? { payload, operationId: crypto.randomUUID() };
    destinationIntent.current = intent;
    setWarehousePending(true);
    try {
      const result = await updatePurchaseDraftDestinationAction({ documentId: existing.id, expectedVersion: documentVersion, warehouseId, reason: destinationReason, operationId: intent.operationId });
      setWarehouseMessage(result.message);
      if (result.success && result.version && result.warehouseId && result.address) {
        setDocumentVersion(result.version); setCommittedWarehouseId(result.warehouseId); setSnapshotAddress(result.address); destinationIntent.current = null; invalidatePrice();
      }
    } catch { setWarehouseMessage("Chưa xác định được kết quả cập nhật. Giữ nội dung và thử lại cùng thao tác."); }
    finally { setWarehousePending(false); }
  }
  return <form className="card card-pad" onSubmit={(event) => {
    event.preventDefault();
    if (pending || warehousePending || disabled || state?.partialPurchaseOrderId || ((canReadPrice || createsSales) && !preview?.success) || (createsSales && !preview?.sales)) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }}>
    <input type="hidden" name="operationId" value={operationId} />
    <input type="hidden" name="mode" value={mode} />
    {existing && <><input type="hidden" name="documentId" value={existing.id} /><input type="hidden" name="expectedVersion" value={documentVersion} /><input type="hidden" name="supplierId" value={existing.supplierId} /></>}
    {(salesLine?.orderId || existing?.sourceSalesOrderId) && <input type="hidden" name="salesOrderId" value={salesLine?.orderId ?? existing?.sourceSalesOrderId ?? ""} />}
    <input type="hidden" name="salesPreview" value={preview?.success && preview.sales ? JSON.stringify(preview.sales.lines) : ""} />
    <input type="hidden" name="costPreview" value={preview?.success ? JSON.stringify(preview.lines) : ""} />
    {!existing && !salesLine && <div className="field mode-field"><label htmlFor="mode">Giao đến</label><select id="mode" value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); invalidatePrice(); }}><option value="WAREHOUSE">Kho Hiền Xa</option><option value="LINKED_DIRECT" disabled={!canCreateSales}>Giao thẳng khách · tạo draft bán liên kết</option></select></div>}
    {salesLine && <section className="context-strip"><strong>{salesLine.orderNumber} · {salesLine.materialName}</strong><span>{salesLine.customerName} · {salesLine.siteName}</span><span>Còn thiếu nguồn: {salesLine.remainingOrderedQuantity} {salesLine.orderedUomSymbol}</span></section>}
    <div className="form-grid">
      <div className="field"><label htmlFor="supplierId">Nhà cung cấp</label><select id="supplierId" name="supplierId" value={supplierId} disabled={!!existing} onChange={(event) => { setSupplierSelection({ context: initialSupplierId, supplier: supplierRows.find((item) => item.id === event.target.value) }); invalidatePrice(); }} required><option value="" disabled>Chọn nhà cung cấp</option>{supplierRows.map((supplier) => <option value={supplier.id} key={supplier.id}>{supplier.name}</option>)}</select></div>
      {!existing && <div className="field"><label htmlFor="supplierSearch">Tìm nhà cung cấp</label><input id="supplierSearch" value={supplierSearch} maxLength={120} placeholder="Mã hoặc tên NCC" onChange={(event) => setSupplierSearch(event.target.value)} /><button className="button button-secondary" type="button" onClick={findSuppliers} disabled={supplierLookupPending}>{supplierLookupPending ? "Đang tìm NCC..." : "Tìm NCC"}</button>{supplierLookup?.query === supplierSearch.trim() && <p role="status" className="form-message">{supplierLookup.message}</p>}</div>}
      {warehouseMode && <div className="field field-full"><label htmlFor="warehouseId">Kho nhận</label><select id="warehouseId" name="warehouseId" value={warehouseId} disabled={warehousePending || pending} onChange={(event) => { setWarehouseId(event.target.value); setWarehouseMessage(""); setAddressInput(""); setAddressReason(""); }} required>{options.warehouses.map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select>
        <p>Địa chỉ kho: {normalizeWarehouseAddress(selectedAddress) ?? "Chưa được bổ sung"}</p>
        {addressMissing && <><p role="alert" className="form-message">{warehouseAddressRequired}</p>{!canManageWarehouse && <p>Vui lòng liên hệ người phụ trách có quyền sửa kho để bổ sung địa chỉ. Nội dung đơn mua được giữ nguyên.</p>}</>}
        {canManageWarehouse && addressMissing && <details><summary>Bổ sung địa chỉ kho</summary><label htmlFor="warehouseAddress">Địa chỉ kho</label><textarea id="warehouseAddress" value={addressInput} maxLength={2000} onChange={(event) => setAddressInput(event.target.value)} /><label htmlFor="warehouseAddressReason">Lý do bổ sung địa chỉ</label><input id="warehouseAddressReason" value={addressReason} maxLength={500} onChange={(event) => setAddressReason(event.target.value)} /><button type="button" className="button button-secondary" disabled={pending || warehousePending || !normalizeWarehouseAddress(addressInput) || addressReason.trim().length < 3} onClick={saveWarehouseAddress}>Lưu địa chỉ kho</button></details>}
        {existing && <><p>Địa chỉ nhận đã lưu trên PO: {normalizeWarehouseAddress(snapshotAddress) ?? "Còn thiếu — cần cập nhật trước khi xác nhận"}</p><label htmlFor="destinationReason">Lý do cập nhật kho nhận</label><input id="destinationReason" value={destinationReason} maxLength={500} onChange={(event) => setDestinationReason(event.target.value)} /><button type="button" className="button button-secondary" disabled={pending || warehousePending || addressMissing || destinationReason.trim().length < 3} onClick={refreshDraftDestination}>{warehouseId === committedWarehouseId ? "Cập nhật địa chỉ từ kho" : "Áp dụng kho nhận"}</button>{warehouseId !== committedWarehouseId && <p role="alert">Bấm áp dụng kho nhận trước khi lưu thay đổi PO.</p>}</>}
        {warehouseMessage && <p role="status" className="form-message">{warehouseMessage}</p>}
      </div>}
      {!warehouseMode && !sourceMode && <><div className="field"><label htmlFor="customerId">Khách hàng</label><select id="customerId" name="customerId" value={customerId} onChange={(event) => { setCustomerId(event.target.value); invalidatePrice(); }} required>{options.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></div><div className="field"><label htmlFor="siteId">Công trình</label><select id="siteId" name="siteId" key={customerId} onChange={invalidatePrice} required>{sites.map((site) => <option value={site.id} key={site.id}>{site.name} · {site.address}</option>)}</select></div></>}
      <div className="field"><label htmlFor="expectedAt">Ngày dự kiến</label><input id="expectedAt" name="expectedAt" type="datetime-local" defaultValue={localDateTime(existing?.expectedAt ?? null)} /></div>
      <div className="field field-full"><label htmlFor="terms">Điều khoản mua</label><textarea id="terms" name="terms" maxLength={1000} defaultValue={existing?.terms ?? ""} /></div>
    </div>
    <div className="section-head flush"><h2>Dòng mua</h2><span className="muted">{lines.length} / 50 dòng</span></div><div className="commercial-line-stack">{lines.map((line, index) => {
      const lineUoms = options.materials.find((material) => material.id === line.materialId)?.uoms ?? [];
      return <div className="commercial-line" key={line.key}><input type="hidden" name="sourceLineId" value={line.sourceLineId} /><div className="commercial-line-head"><strong>Dòng {index + 1}</strong><button className="button button-secondary" type="button" onClick={() => { invalidatePrice(); setLines((current) => current.filter((item) => item.key !== line.key)); }} disabled={lines.length === 1}>Xóa dòng</button></div><div className="commercial-line-grid">
        {sourceMode ? <><div className="field"><label htmlFor={`purchase-source-${line.key}`}>Dòng đơn bán *</label><select id={`purchase-source-${line.key}`} name={line.sourceLineId ? undefined : "salesLineId"} value={line.salesLineId} disabled={!!line.sourceLineId} onChange={(event) => { const selected = availableSourceLines.find((item) => item.id === event.target.value); if (selected) updateLine(line.key, { salesLineId: selected.id, materialId: selected.materialId, uomId: selected.uomId, quantity: selected.remainingOrderedQuantity }); }} required>{availableSourceLines.map((item) => <option key={item.id} value={item.id} disabled={item.id !== line.salesLineId && (Number(item.remainingOrderedQuantity) <= 0 || lines.some((entry) => entry.salesLineId === item.id))}>{item.materialName} · còn {item.remainingOrderedQuantity} {item.uomSymbol}</option>)}</select>{line.sourceLineId && <input type="hidden" name="salesLineId" value={line.salesLineId} />}</div><div className="field"><span>Vật tư nguồn</span><strong>{availableSourceLines.find((item) => item.id === line.salesLineId)?.materialName ?? "Dòng không còn khả dụng"}</strong><input type="hidden" name="materialId" value={line.materialId} /></div></> : <><input type="hidden" name="salesLineId" value="" /><div className="field"><label htmlFor={`purchase-material-${line.key}`}>Vật tư *</label><select id={`purchase-material-${line.key}`} name="materialId" value={line.materialId} onChange={(event) => { const selected = options.materials.find((item) => item.id === event.target.value); updateLine(line.key, { materialId: event.target.value, uomId: selected?.uoms[0]?.id ?? "" }); }} required>{options.materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></div></>}
        <div className="field"><label htmlFor={`purchase-uom-${line.key}`}>Đơn vị mua *</label><select id={`purchase-uom-${line.key}`} name={line.manualCostVnd && !canManagePrice ? undefined : "orderedUomId"} value={line.uomId} disabled={!!line.manualCostVnd && !canManagePrice} onChange={(event) => updateLine(line.key, { uomId: event.target.value })} required>{lineUoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.symbol}</option>)}</select>{line.manualCostVnd && !canManagePrice && <input type="hidden" name="orderedUomId" value={line.uomId} />}</div>
        <div className="field"><label htmlFor={`purchase-qty-${line.key}`}>Số lượng *</label><input id={`purchase-qty-${line.key}`} name="quantity" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required /></div>
        {createsSales && canManageSalesPrice && <><div className="field"><label htmlFor={`sales-price-${line.key}`}>Giá bán thủ công (VND)</label><input id={`sales-price-${line.key}`} name="manualSalesPriceVnd" inputMode="numeric" value={line.manualSalesPriceVnd} onChange={(event) => updateLine(line.key, { manualSalesPriceVnd: event.target.value })} /></div><details className="field"><summary>Ghi chú ngoại lệ giá bán</summary><label htmlFor={`sales-reason-${line.key}`}>Lý do giá bán thủ công</label><input id={`sales-reason-${line.key}`} name="manualSalesReason" maxLength={500} value={line.manualSalesReason} onChange={(event) => updateLine(line.key, { manualSalesReason: event.target.value })} /><p className="muted">Giá sau giảm thông thường có audit giá trước/sau. Không có tham chiếu hoặc ngoại lệ vẫn cần lý do được duyệt.</p></details></>}
        {canManagePrice ? <><div className="field"><label htmlFor={`purchase-cost-${line.key}`}>Giá mua thủ công (VND)</label><input id={`purchase-cost-${line.key}`} name="manualCostVnd" inputMode="numeric" value={line.manualCostVnd} onChange={(event) => updateLine(line.key, { manualCostVnd: event.target.value })} /></div><details className="field"><summary>Ghi chú ngoại lệ giá mua</summary><label htmlFor={`purchase-reason-${line.key}`}>Lý do giá thủ công</label><input id={`purchase-reason-${line.key}`} name="manualCostReason" maxLength={500} value={line.manualCostReason} onChange={(event) => updateLine(line.key, { manualCostReason: event.target.value })} /><p className="muted">Giá mua thông thường trong tham chiếu có audit tự động; giá tăng hoặc không có tham chiếu vẫn cần lý do được duyệt. Quyền quản lý giá không đổi.</p></details></> : <><input type="hidden" name="manualCostVnd" value={line.manualCostVnd} /><input type="hidden" name="manualCostReason" value="" />{line.manualCostVnd && <p className="muted">Giá mua thủ công đã duyệt: {formatVnd(vnd(line.manualCostVnd))}. Chỉ người quản lý giá được đổi.</p>}</>}
      </div>{canReadPrice && (preview?.success && preview.lines?.[index] ? <div className="commercial-price-strip"><span>Giá mua: <strong>{formatVnd(vnd(preview.lines[index].unitCostVnd))}</strong></span><span>Nguồn: <strong>{preview.lines[index].priceSourceType}</strong></span><span>Thành tiền: <strong>{formatVnd(vnd(preview.lines[index].lineTotalVnd))}</strong></span></div> : <p className="muted">Chưa xem trước giá dòng này.</p>)}{createsSales && preview?.success && preview.sales?.lines[index] && <div className="commercial-price-strip"><span>Giá bán khách: <strong>{formatVnd(vnd(preview.sales.lines[index].unitPriceVnd))}</strong></span><span>Nguồn: <strong>{preview.sales.lines[index].priceSourceType}</strong></span><span>Thành tiền bán: <strong>{formatVnd(vnd(preview.sales.lines[index].lineTotalVnd))}</strong></span></div>}</div>;
    })}</div><button className="button button-secondary" type="button" onClick={addLine} disabled={lines.length >= 50 || !options.materials.length || (sourceMode && !availableSourceLines.some((item) => Number(item.remainingOrderedQuantity) > 0 && !lines.some((line) => line.salesLineId === item.id)))}>+ Thêm dòng</button>
    {(canReadPrice || createsSales) ? <div className="commercial-preview"><button className="button button-secondary" type="button" onClick={loadPreview} disabled={pending || previewPending || disabled}>{previewPending ? "Đang tính giá..." : createsSales ? "Xem trước giá mua và giá bán" : "Tính giá mua và xem trước"}</button>{preview?.success && preview.totalVnd && <div className="commercial-preview-total"><span>Tạm tính <strong>{formatVnd(vnd(preview.totalVnd))}</strong></span><span>Tổng <strong>{formatVnd(vnd(preview.totalVnd))}</strong></span></div>}</div> : <p className="muted">Giá mua được giữ ẩn theo quyền. Hệ thống vẫn kiểm tra giá khi lưu.</p>}
    {createsSales && preview?.success && preview.sales && <div className="commercial-preview-total"><span>Tổng giá bán khách <strong>{formatVnd(vnd(preview.sales.totalVnd))}</strong></span></div>}
    {preview?.message && <p role="status" className={`form-message${preview.success ? " success" : ""}`}>{preview.message}</p>}
    {mode === "LINKED_DIRECT" && !salesLine && <p className="mock-banner">{existing ? "Lưu cập nhật PO nháp này; không tạo đơn mua hoặc đơn bán mới. Đơn bán liên kết được giữ nguyên." : "Giá mua được lưu trên đơn mua. Gắn đơn bán có sẵn sẽ giữ nguyên giá bán; chọn tạo đơn bán liên kết sẽ lưu hai bản nháp cùng lúc."}</p>}
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    {state?.partialPurchaseOrderId && <Link className="button button-secondary" href={`/admin/purchase-orders/${state.partialPurchaseOrderId}/edit`}>Mở PO nháp đã tạo</Link>}
    <div className="form-actions"><button className="button button-primary" disabled={pending || warehousePending || disabled || !!state?.partialPurchaseOrderId || ((canReadPrice || createsSales) && !preview?.success) || (createsSales && !preview?.sales)} type="submit">{pending ? "Đang lưu..." : existing ? "Lưu thay đổi PO nháp" : salesLine ? "Lưu PO giao thẳng" : mode === "LINKED_DIRECT" ? "Lưu đơn mua và bản nháp bán" : "Lưu nháp đơn mua"}</button></div>
  </form>;
}
