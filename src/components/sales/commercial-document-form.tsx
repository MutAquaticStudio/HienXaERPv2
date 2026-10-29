"use client";
import { Dialog } from "@/components/ui/dialog";
import { DocumentLineTable } from "@/components/documents/editor/document-line-table";
import { DocumentTotalValue } from "@/components/documents/editor/document-total";
import { EntityCombobox, type EntityComboboxHandle } from "@/components/documents/editor/entity-combobox";
import { LineStock, lineStock } from "@/components/documents/editor/line-stock";
import { addMaterialLine } from "@/components/documents/editor/lines";
import { MaterialSearchBox, type MaterialSearchHandle } from "@/components/documents/editor/material-search-box";
import type { EditorLine, EditorMaterial, EntityOption } from "@/components/documents/editor/types";
import { useAutoPricePreview } from "@/components/documents/editor/use-auto-price-preview";

import { startTransition, useActionState, useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { DiscountField, LinePriceDialog, draftDiscount, type DiscountDraft } from "@/components/sales/discount-controls";
import { applySalesDiscounts, discountLabel } from "@/modules/sales/discounts";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { isPositiveSalesQuantity } from "@/modules/sales/quantity-input";
import { priceSourceLabel } from "@/modules/pricing/presentation";
import { userFacingError } from "@/lib/core/errors";
import { createCustomerQuickAction, createSiteQuickAction } from "@/modules/customers/actions";
import { createQuotationAction, createSalesOrderAction, previewCommercialDocumentAction, updateQuotationDraftAction, updateSalesOrderDraftAction, type PricePreviewResult, type SalesActionState } from "@/modules/sales/actions";
import { loadCustomerDebtAction, type CustomerDebt } from "@/modules/sales/customer-debt-actions";
import { searchSalesCustomersAction, searchSalesSitesAction } from "@/modules/sales/form-lookup-actions";
import type { SalesFormOptions } from "@/modules/sales/form-options";
import { defaultPrepaymentAccount, PREPAYMENT_METHODS, prepaymentMethodLabels, type PrepaymentMethod, type PrepaymentOptions } from "@/modules/sales/prepayment";
import { MoneyInput } from "@/components/ui/money-input";

export type ExistingCommercialDraft = {
  id: string; version: number; customerId: string; siteId: string;
  effectiveAt: string | null; terms: string | null;
  lines: { sourceLineId: string; materialId: string; uomId: string; quantity: string; manualPriceVnd: string; manualReason: string;
    discountMode?: "" | "AMOUNT" | "PERCENT"; discountValue?: string }[];
  orderDiscount?: DiscountDraft | null;
};

type Site = SalesFormOptions["customers"][number]["sites"][number];
const PREVIEW_FAILURE: PricePreviewResult = { success: false, message: "Không thể xem trước giá. Thử lại sau." };

function localDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(" ", "T");
}

const siteOption = (site: Site): EntityOption => ({ id: site.id, label: site.name, detail: site.address });

/** "Thêm khách hàng / Thêm công trình" — also used by the Excel import to add a customer the file names (D37). */
export function QuickCreatePanel({ mode, customerId, onCustomerCreated, onSiteCreated, onClose, defaults }: {
  mode: "customer" | "site"; customerId: string; defaults?: { name?: string; phone?: string };
  onCustomerCreated: (customer: { id: string; name: string }) => void;
  onSiteCreated: (site: Site) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      const result = mode === "customer" ? await createCustomerQuickAction(undefined, data) : await createSiteQuickAction(undefined, data);
      if (!result.success || !result.id || !result.name) { setMessage(result.message); return; }
      if (mode === "customer") onCustomerCreated({ id: result.id, name: result.name });
      else onSiteCreated({ id: result.id, name: result.name, address: result.address ?? String(data.get("address") ?? "") });
    } catch { setMessage("Không thể tạo nhanh. Kiểm tra quyền và thử lại."); }
    finally { setPending(false); }
  }
  return <Dialog eyebrow="Tạo nhanh trong bán hàng" title={mode === "customer" ? "Thêm khách hàng" : "Thêm công trình"} onClose={onClose} initialFocusId="quick-create-code"
    description="Đơn đang soạn được giữ nguyên. Sau khi tạo, bản ghi mới sẽ được chọn tự động.">
    <form onSubmit={submit} className="form-grid">
      {mode === "site" && <input type="hidden" name="customerId" value={customerId} />}
      <div className="field"><label htmlFor="quick-create-code">Mã *</label><input id="quick-create-code" name="code" required minLength={2} maxLength={32} autoCapitalize="characters" autoComplete="off"
        className={mode === "customer" ? "input-code" : undefined} /></div>
      <div className="field"><label htmlFor="quick-create-name">{mode === "customer" ? "Tên khách hàng" : "Tên công trình"} *</label><input id="quick-create-name" name="name" required minLength={2} maxLength={160} defaultValue={defaults?.name} /></div>
      {mode === "customer" ? <div className="field"><label htmlFor="quick-create-phone">Điện thoại</label><input id="quick-create-phone" name="phone" maxLength={60} defaultValue={defaults?.phone} /></div> : <><div className="field field-full"><label htmlFor="quick-create-address">Địa chỉ giao hàng *</label><input id="quick-create-address" name="address" required minLength={3} maxLength={500} /></div><div className="field"><label htmlFor="quick-create-receiver">Người nhận</label><input id="quick-create-receiver" name="receiverName" maxLength={120} /></div><div className="field"><label htmlFor="quick-create-receiver-phone">Điện thoại người nhận</label><input id="quick-create-receiver-phone" name="receiverPhone" maxLength={60} /></div></>}
      {message && <p className="form-message field-full" role="status">{userFacingError(message)}</p>}
      <div className="form-actions field-full"><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang tạo..." : mode === "customer" ? "Tạo khách hàng" : "Tạo công trình"}</button></div>
    </form>
  </Dialog>;
}

type ReviewLine = { key: number; name: string; quantity: string; symbol: string; totalVnd: string | null };

/**
 * "Xác nhận đơn" review (D6): what will be confirmed, the customer's current and overdue debt (with receivable rights),
 * then the confirm button submits the order form with intent "confirm".
 */
function OrderReview({ formId, customer, site, siteAddress, lines, totalVnd, grossVnd, discountVnd, prepaid, onClose }: {
  formId: string; customer: EntityOption | null; site: EntityOption | null; siteAddress?: string; lines: ReviewLine[]; totalVnd: string | null;
  grossVnd?: string | null; discountVnd?: string | null; prepaid?: { amountVnd: string; method: string; account: string } | null; onClose: () => void;
}) {
  const [debt, setDebt] = useState<CustomerDebt | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (customer) loadCustomerDebtAction(customer.id).then((loaded) => { if (live) setDebt(loaded); }, () => { if (live) setDebt(null); });
    return () => { live = false; };
  }, [customer]);
  const money = (value: string | null) => value === null ? "—" : formatVnd(vnd(value));
  return <Dialog eyebrow="Kiểm tra trước khi xác nhận" title="Xác nhận đơn bán" onClose={onClose} initialFocusId="order-review-confirm">
    <dl className="detail-grid order-review-summary">
      <div className="detail-item"><dt>Khách hàng</dt><dd>{customer?.label}</dd></div>
      <div className="detail-item"><dt>Công trình / điểm giao</dt><dd>{site?.label}{siteAddress && <small className="table-subline">{siteAddress}</small>}</dd></div>
      <div className="detail-item"><dt>Số dòng</dt><dd>{lines.length}</dd></div>
      {discountVnd && discountVnd !== "0" && <><div className="detail-item"><dt>Tổng tiền hàng</dt><dd>{money(grossVnd ?? null)}</dd></div>
        <div className="detail-item"><dt>Giảm giá</dt><dd>−{money(discountVnd)}</dd></div></>}
      <div className="detail-item"><dt>{discountVnd && discountVnd !== "0" ? "Khách cần trả" : "Tổng tiền hàng"}</dt><dd><strong>{money(totalVnd)}</strong></dd></div>
      {prepaid && <><div className="detail-item"><dt>Khách trả trước</dt><dd>{money(prepaid.amountVnd)} · {prepaid.method} · {prepaid.account}</dd></div>
        {totalVnd && <div className="detail-item"><dt>Còn phải trả</dt><dd>{money((BigInt(totalVnd) > BigInt(prepaid.amountVnd) ? BigInt(totalVnd) - BigInt(prepaid.amountVnd) : 0n).toString())}</dd></div>}</>}
      {debt && <><div className="detail-item"><dt>Nợ hiện tại</dt><dd>{money(debt.outstandingVnd)}</dd></div>
        <div className="detail-item"><dt>Nợ quá hạn</dt><dd className={debt.overdueVnd !== "0" ? "text-danger" : undefined}>{money(debt.overdueVnd)}</dd></div></>}
    </dl>
    {debt === undefined && customer && <p className="muted">Đang tải công nợ của khách...</p>}
    <div className="table-wrap"><table className="order-review-lines">
      <thead><tr><th scope="col">Vật tư</th><th scope="col" className="numeric">Số lượng</th><th scope="col" className="numeric">Thành tiền</th></tr></thead>
      <tbody>{lines.map((line) => <tr key={line.key}><td>{line.name}</td><td className="numeric">{formatQuantity(line.quantity)} {line.symbol}</td><td className="numeric">{money(line.totalVnd)}</td></tr>)}</tbody>
    </table></div>
    {debt && debt.overdueVnd !== "0" && <p className="form-message" role="status">Khách đang có nợ quá hạn; đơn có thể bị chặn theo hạn mức. Khi bị chặn, đơn được giữ ở nháp và có lối duyệt vượt hạn mức.</p>}
    <p className="muted">Kiểm tra kỹ khách, công trình, số lượng và giá. Sau khi xác nhận, sửa đơn phải qua điều chỉnh.</p>
    <div className="form-actions">
      <button id="order-review-confirm" className="button button-commerce" type="submit" form={formId} name="intent" value="confirm">Xác nhận đơn</button>
      <button className="button button-secondary" type="button" onClick={onClose}>Quay lại sửa</button>
    </div>
  </Dialog>;
}

export function CommercialDocumentForm({ kind, options, operationId, confirmOperationId, canConfirm = false, canManagePrice, canManageCustomers, existing, initialCustomerId, initialSiteId, initialMaterialId, prepayment }: {
  kind: "order" | "quote"; options: SalesFormOptions; operationId: string; confirmOperationId?: string; canConfirm?: boolean;
  canManagePrice: boolean; canManageCustomers: boolean; existing?: ExistingCommercialDraft;
  initialCustomerId?: string; initialSiteId?: string; initialMaterialId?: string;
  /** New orders, with the right to record receipts: "Khách trả trước" goes into the cash book when the order is saved. */
  prepayment?: PrepaymentOptions | null;
}) {
  const action = existing ? (kind === "order" ? updateSalesOrderDraftAction : updateQuotationDraftAction) : (kind === "order" ? createSalesOrderAction : createQuotationAction);
  const lastSubmission = useRef<FormData | null>(null);
  const submissionPending = useRef(false);
  const [state, formAction, pending] = useActionState(async (previous: SalesActionState, data: FormData): Promise<SalesActionState> => {
    lastSubmission.current = data;
    try { return await action(previous, data); }
    catch (error) {
      // Preserve Next's redirect/auth control flow; only a failed transport is unresolved.
      const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : "";
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) throw error;
      return { success: false, outcomeUnknown: true, message: "Chưa xác định kết quả. Giữ nguyên mã thao tác; thử lại đúng dữ liệu đã gửi, không tạo đơn mới." };
    } finally { submissionPending.current = false; }
  }, undefined);

  const findCustomer = (id?: string) => options.customers.find((item) => item.id === id);
  const startCustomer = findCustomer(existing?.customerId ?? initialCustomerId);
  const [customer, setCustomer] = useState<EntityOption | null>(startCustomer ? { id: startCustomer.id, label: startCustomer.name } : null);
  const [customerChoices, setCustomerChoices] = useState<EntityOption[]>(options.customers.map((item) => ({ id: item.id, label: item.name })));
  const [sitesByCustomer, setSitesByCustomer] = useState<Record<string, Site[]>>(() => Object.fromEntries(options.customers.map((item) => [item.id, item.sites])));
  const startSite = startCustomer?.sites.find((item) => item.id === (existing?.siteId ?? initialSiteId));
  const [site, setSite] = useState<EntityOption | null>(startSite ? siteOption(startSite) : null);
  const sites = customer ? sitesByCustomer[customer.id] ?? [] : [];
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [effectiveAt, setEffectiveAt] = useState(localDateTime(existing?.effectiveAt ?? null));
  const [lookupMessage, setLookupMessage] = useState("");
  const siteLoadRevision = useRef(0);
  const [quickMode, setQuickMode] = useState<"customer" | "site" | null>(null);

  const startMaterial = initialMaterialId ? options.materials.find((item) => item.id === initialMaterialId) : undefined;
  const [lines, setLines] = useState<EditorLine[]>(existing
    ? existing.lines.map((line, key) => ({ ...line, key }))
    : startMaterial ? [{ key: 0, sourceLineId: "", materialId: startMaterial.id, uomId: startMaterial.uoms[0]?.id ?? "", quantity: "1", manualPriceVnd: "", manualReason: "" }] : []);
  const nextLineKey = useRef(existing?.lines.length ?? 1);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const searchRef = useRef<MaterialSearchHandle>(null);
  const siteRef = useRef<EntityComboboxHandle>(null);
  const formId = useId();
  const [reviewOpen, setReviewOpen] = useState(false);
  const prepaying = kind === "order" && !existing && !!prepayment;
  const [prepaidVnd, setPrepaidVnd] = useState("");
  const [prepaidMethod, setPrepaidMethod] = useState<PrepaymentMethod>("CASH");
  const [prepaidAccountId, setPrepaidAccountId] = useState(() => prepayment ? defaultPrepaymentAccount(prepayment.accounts, "CASH")?.id ?? "" : "");
  const prepaidAmount = /^[1-9]\d*$/.test(prepaidVnd) ? prepaidVnd : "";
  const prepaidAccount = prepayment?.accounts.find((account) => account.id === prepaidAccountId);
  // Discounts (orders, with pricing rights): typed per line in the price popup and for the whole order in the totals.
  const discounts = kind === "order" && canManagePrice;
  const [orderDiscount, setOrderDiscount] = useState<DiscountDraft>(existing?.orderDiscount ?? { mode: "", value: "" });
  const [priceLineKey, setPriceLineKey] = useState<number | null>(null);
  const availability = options.availability;
  // Stock is shown for one warehouse at a time, the first of the branch unless another is chosen.
  const [stockWarehouseId, setStockWarehouseId] = useState(availability?.warehouses[0]?.id ?? "");
  const materialOf = (id: string) => options.materials.find((item) => item.id === id);

  const customerId = customer?.id ?? "";
  const siteId = site?.id ?? "";
  const priceMissing = !customerId || !siteId ? "Chọn khách hàng và công trình để tính giá"
    : !lines.length ? "Thêm vật tư để tính giá"
    : lines.some((line) => !line.materialId || !line.uomId || !isPositiveSalesQuantity(line.quantity)) ? "Sửa dòng hàng chưa hợp lệ để tính giá" : null;
  const empty = !!priceMissing;
  // Only what the price depends on: a discount typed in the price popup does not ask the server again.
  const pricingLines = JSON.stringify(lines.map((line) => ({ materialId: line.materialId, orderedUomId: line.uomId, quantity: line.quantity,
    manualPriceVnd: line.manualPriceVnd, manualReason: line.manualReason, sourceLineId: line.sourceLineId })));
  const load = useCallback(() => previewCommercialDocumentAction({ kind, customerId, siteId,
    documentId: existing?.id, expectedVersion: existing?.version, lines: JSON.parse(pricingLines) }),
  [kind, customerId, siteId, existing?.id, existing?.version, pricingLines]);
  const { preview, pending: previewPending, invalidate } = useAutoPricePreview({
    load, enabled: !empty && !pending && !state?.outcomeUnknown, scope: state, failure: PREVIEW_FAILURE, holdUntilChange: !!existing,
  });

  function changeLines(next: (current: EditorLine[]) => EditorLine[]) {
    invalidate();
    setLines(next);
  }
  const previewLines = preview?.success && preview.lines?.length === lines.length ? preview.lines : null;
  const discounted = useMemo(() => {
    if (kind !== "order" || !previewLines) return null;
    try {
      return applySalesDiscounts(previewLines.map((line, index) => ({ quantity: lines[index].quantity, listUnitVnd: line.unitPriceVnd,
        discount: draftDiscount({ mode: lines[index].discountMode ?? "", value: lines[index].discountValue ?? "" }) })), draftDiscount(orderDiscount));
    } catch { return null; }
  }, [kind, previewLines, lines, orderDiscount]);
  const discountedOk = discounted?.ok ? discounted : null;
  const priceLine = priceLineKey === null ? null : lines.find((line) => line.key === priceLineKey) ?? null;
  // A stored draft is priced on its first change. Discounts need the price, so touching them counts as a change.
  const needPrice = () => { if (!preview && !previewPending) invalidate(); };
  function pickMaterial(material: EditorMaterial) {
    const result = addMaterialLine(lines, material, nextLineKey.current);
    if (!result) { setLookupMessage("Đơn bán tối đa 50 dòng."); return; }
    if (result.focusKey === nextLineKey.current) nextLineKey.current += 1;
    changeLines(() => result.lines);
    setFocusKey(result.focusKey);
    setFocusSeq((seq) => seq + 1);
  }
  async function loadSites(targetCustomerId: string, term: string) {
    const revision = ++siteLoadRevision.current;
    const found = await searchSalesSitesAction(kind, targetCustomerId, term);
    if (revision === siteLoadRevision.current && !term) setSitesByCustomer((current) => ({ ...current, [targetCustomerId]: found }));
    return found;
  }
  function selectCustomer(option: EntityOption | null) {
    siteLoadRevision.current += 1;
    setCustomer(option);
    setSite(null);
    invalidate();
    setLookupMessage("");
    if (!option) return;
    void loadSites(option.id, "").then(() => siteRef.current?.focus(), () => setLookupMessage("Không thể tải công trình. Thử lại sau."));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending.current || pending || empty || !preview?.success || state?.outcomeUnknown) return;
    submissionPending.current = true;
    const data = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name === "intent") data.set("intent", submitter.value);
    setReviewOpen(false);
    startTransition(() => formAction(data));
  }

  const ready = !empty && !!preview?.success && !pending && !state?.outcomeUnknown && !(discounted && !discounted.ok);
  const confirmable = kind === "order" && !existing && canConfirm && !!confirmOperationId;
  const orderNetVnd = discountedOk?.netTotalVnd ?? (preview?.success ? preview.totalVnd ?? null : null);
  const remainingVnd = prepaidAmount && orderNetVnd ? (BigInt(orderNetVnd) > BigInt(prepaidAmount) ? BigInt(orderNetVnd) - BigInt(prepaidAmount) : 0n).toString() : null;
  return <><form id={formId} className="doc-editor commercial-document-form" action={formAction} onReset={(event) => event.preventDefault()} onSubmit={submit}>
    <input type="hidden" name="operationId" value={operationId} />
    {confirmable && <input type="hidden" name="confirmOperationId" value={confirmOperationId} />}
    {existing && <><input type="hidden" name="documentId" value={existing.id} /><input type="hidden" name="expectedVersion" value={existing.version} /></>}
    <input type="hidden" name="pricePreview" value={preview?.success ? JSON.stringify(preview.lines) : ""} />

    <section className="card doc-editor-main" aria-label="Dòng hàng">
      <div className="doc-editor-toolbar"><MaterialSearchBox ref={searchRef} materials={options.materials} onPick={pickMaterial} disabled={!options.materials.length}
        hint={availability ? (material) => { const stock = lineStock(availability, stockWarehouseId, material, material.uoms[0]?.id ?? "", ""); return stock ? `Có thể bán ${formatQuantity(stock.available)} ${stock.baseSymbol}` : stock === null ? "Chưa có tồn" : null; } : undefined} />
      {availability && availability.warehouses.length > 0 && <label className="doc-editor-stock-warehouse">Xem tồn tại<select value={stockWarehouseId} onChange={(event) => setStockWarehouseId(event.target.value)}>
        {availability.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}</div>
      <DocumentLineTable lines={lines} materials={options.materials} canManagePrice={canManagePrice} isValidQuantity={isPositiveSalesQuantity} focusKey={focusKey} focusSeq={focusSeq}
        labels={{ uom: "ĐVT bán", price: "Đơn giá" }}
        priced={(index) => preview?.success && preview.lines?.[index] ? { unitPriceVnd: discountedOk?.lines[index]?.unitPriceVnd ?? preview.lines[index].unitPriceVnd,
          lineTotalVnd: discountedOk?.lines[index]?.lineTotalVnd ?? preview.lines[index].lineTotalVnd, sourceLabel: priceSourceLabel(preview.lines[index].priceSourceType),
          sourceType: preview.lines[index].priceSourceType } : null}
        hiddenFields={kind === "order" ? (line) => <><input type="hidden" name="discountMode" value={line.discountValue?.trim() ? line.discountMode ?? "" : ""} />
          <input type="hidden" name="discountValue" value={line.discountValue?.trim() && line.discountMode ? line.discountValue : ""} /></> : undefined}
        renderPrice={discounts ? (line, index, price) => {
          const own = draftDiscount({ mode: line.discountMode ?? "", value: line.discountValue ?? "" });
          const result = discountedOk?.lines[index];
          const cut = result && result.discountUnitVnd !== "0";
          return <button type="button" className="line-price-button" aria-label={`Đơn giá và giảm giá dòng ${index + 1}`} onClick={() => { needPrice(); setPriceLineKey(line.key); }}>
            <span>{price ? formatVnd(vnd(price.unitPriceVnd)) : line.manualPriceVnd ? formatVnd(vnd(line.manualPriceVnd)) : "Giá hệ thống"}</span>
            {cut && <s className="table-subline">{formatVnd(vnd(result.listUnitVnd))}</s>}
            {own || cut ? <small className="table-subline price-discount">{own ? discountLabel(own) : "Giảm theo đơn"}</small>
              : line.manualPriceVnd ? <small className="price-source" data-source="MANUAL_APPROVED">Giá thủ công</small>
              : price ? <small className="price-source" data-source={price.sourceType}>{price.sourceLabel}</small>
              : <small className="table-subline">Bấm để giảm giá</small>}
          </button>;
        } : undefined}
        onChange={(key, change) => changeLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line))}
        onRemove={(key) => { changeLines((current) => current.filter((line) => line.key !== key)); searchRef.current?.focus(); }}
        onDone={() => searchRef.current?.focus()}
        detail={availability ? (line) => <LineStock availability={availability} warehouseId={stockWarehouseId} material={materialOf(line.materialId)} uomId={line.uomId} quantity={line.quantity} /> : undefined} />
    </section>

    <div className="doc-editor-rail"><aside className="card card-pad doc-editor-side" aria-label="Thông tin đơn">
      <EntityCombobox label="Khách hàng" name="customerId" value={customer} options={customerChoices} readOnly={!!existing} placeholder="Tìm khách theo mã hoặc tên"
        onSearch={async (term) => { const found = (await searchSalesCustomersAction(kind, term)).map((item) => ({ id: item.id, label: item.name })); setCustomerChoices((current) => [...current, ...found.filter((item) => !current.some((row) => row.id === item.id))]); return found; }}
        onSelect={selectCustomer}
        action={!existing && canManageCustomers ? <button type="button" className="quick-create-trigger" onClick={() => setQuickMode("customer")}>+ Thêm khách</button> : undefined} />
      <EntityCombobox ref={siteRef} label="Công trình / điểm giao" name="siteId" value={site} options={sites.map(siteOption)} readOnly={!!existing} disabled={!customerId}
        placeholder={customerId ? "Chọn công trình giao hàng" : "Chọn khách hàng trước"} emptyText="Khách chưa có công trình phù hợp."
        onSearch={customerId ? async (term) => (await loadSites(customerId, term)).map(siteOption) : undefined}
        onSelect={(option) => { setSite(option); invalidate(); if (option) searchRef.current?.focus(); }}
        action={!existing && canManageCustomers ? <button type="button" className="quick-create-trigger" onClick={() => setQuickMode("site")} disabled={!customerId}>+ Thêm công trình</button> : undefined} />
      {lookupMessage && <p className="form-message" role="status">{lookupMessage}</p>}
    </aside>

    <div className="card card-pad doc-editor-footer" role="group" aria-label="Tổng tiền và lưu đơn">
      {preview && !preview.success && <p role="status" className="form-message">{userFacingError(preview.message)}</p>}
      {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{userFacingError(state.message)}</p>}
      <div className="doc-editor-totals"><dl className="doc-editor-summary">
        <div><dt>Số dòng</dt><dd>{lines.length}</dd></div>
        <div className={discountedOk && discountedOk.discountTotalVnd !== "0" ? undefined : "doc-editor-total"}><dt>Tổng tiền hàng</dt><dd><DocumentTotalValue totalVnd={preview?.success ? preview.totalVnd : null} pending={previewPending && !priceMissing} /></dd></div>
        {discountedOk && discountedOk.discountTotalVnd !== "0" && <>
          <div><dt>Giảm giá</dt><dd>−{formatVnd(vnd(discountedOk.discountTotalVnd))}</dd></div>
          <div className="doc-editor-total"><dt>Khách cần trả</dt><dd>{formatVnd(vnd(discountedOk.netTotalVnd))}</dd></div></>}
      </dl>
      {discounts && <DiscountField id="order-discount" label="Giảm giá đơn" draft={orderDiscount} onChange={(next) => { needPrice(); setOrderDiscount(next); }}
        hint={discountedOk && discountedOk.orderRequestedVnd !== discountedOk.orderAppliedVnd
          ? `Giảm được ${formatVnd(vnd(discountedOk.orderAppliedVnd))} (lệch ${formatVnd(vnd((BigInt(discountedOk.orderRequestedVnd) - BigInt(discountedOk.orderAppliedVnd)).toString()))} vì giá mỗi đơn vị phải là số đồng nguyên).`
          : undefined} />}
      {kind === "order" && <><input type="hidden" name="orderDiscountMode" value={orderDiscount.value.trim() ? orderDiscount.mode : ""} />
        <input type="hidden" name="orderDiscountValue" value={orderDiscount.mode ? orderDiscount.value : ""} /></>}
      {discounted && !discounted.ok && <p className="form-message" role="alert">{discounted.message}</p>}
      {priceMissing && <p className="doc-editor-total-hint">{priceMissing}</p>}
      {prepaying && <fieldset className="order-prepayment"><legend>Khách trả trước</legend>
        {prepayment!.accounts.length ? <>
          <div className="field"><label htmlFor="prepayment-amount">Số tiền</label><MoneyInput id="prepayment-amount" name="prepaymentVnd" value={prepaidVnd} onValue={setPrepaidVnd} placeholder="0" disabled={pending} /></div>
          <div className="field"><label htmlFor="prepayment-method">Phương thức</label><select id="prepayment-method" name="prepaymentMethod" value={prepaidMethod} disabled={pending}
            onChange={(event) => { const method = event.target.value as PrepaymentMethod; setPrepaidMethod(method); setPrepaidAccountId(defaultPrepaymentAccount(prepayment!.accounts, method)?.id ?? ""); }}>
            {PREPAYMENT_METHODS.map((method) => <option key={method} value={method}>{prepaymentMethodLabels[method]}</option>)}</select></div>
          <div className="field"><label htmlFor="prepayment-account">Vào quỹ</label><select id="prepayment-account" name="prepaymentAccountId" value={prepaidAccountId} disabled={pending} onChange={(event) => setPrepaidAccountId(event.target.value)}>
            {prepayment!.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
          <input type="hidden" name="prepaymentAt" value={prepayment!.at} />
          {remainingVnd !== null && <p className="muted">Còn phải trả {formatVnd(vnd(remainingVnd))}. Ghi vào Sổ quỹ là khoản khách ứng trước; trừ vào công nợ khi giao hàng.</p>}
        </> : <p className="muted">Chưa có tài khoản tiền. Tạo ở Sổ quỹ để ghi tiền khách trả trước.</p>}
      </fieldset>}</div>
      <div className="doc-editor-actions">
        <button className={confirmable ? "button button-secondary doc-editor-draft" : "button button-primary"} type="submit" name="intent" value="draft" disabled={!ready}>{pending && !confirmable ? "Đang lưu..." : existing ? "Lưu thay đổi bản nháp" : "Lưu nháp"}</button>
        {confirmable && <button className="button button-commerce doc-editor-confirm" type="button" disabled={!ready} onClick={() => setReviewOpen(true)}>{pending ? "Đang lưu..." : "Xác nhận đơn"}</button>}
        {state?.outcomeUnknown && <button className="button button-secondary" type="button" disabled={pending} onClick={() => { const original = lastSubmission.current; if (original && !submissionPending.current) { submissionPending.current = true; startTransition(() => formAction(original)); } }}>Thử lại đúng thao tác</button>}
      </div>
      {confirmable && <p className="muted doc-editor-hint">“Xác nhận đơn” mở bảng kiểm tra rồi lưu và xác nhận; “Lưu nháp” để sửa tiếp sau.</p>}
    </div>

    <div className="card card-pad doc-editor-extra" role="group" aria-label={kind === "order" ? "Ngày giao và ghi chú" : "Hiệu lực và ghi chú"}>
      <div className="field"><label htmlFor="effectiveAt">{kind === "order" ? "Ngày giao dự kiến" : "Hiệu lực đến"}</label><input id="effectiveAt" name="effectiveAt" type="datetime-local" value={effectiveAt} onChange={(event) => setEffectiveAt(event.target.value)} required={kind === "quote"} /></div>
      <div className="field"><label htmlFor="terms">Điều khoản / ghi chú</label><textarea id="terms" name="terms" rows={2} maxLength={1000} aria-describedby="terms-hint" value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="Điều kiện giao, thanh toán hoặc lưu ý" /><small id="terms-hint" className="muted">{terms.length}/1.000</small></div>
    </div></div>
  </form>{reviewOpen && confirmable && preview?.success && <OrderReview formId={formId} customer={customer} site={site} siteAddress={sites.find((item) => item.id === siteId)?.address}
    lines={lines.map((line, index) => ({ key: line.key, name: materialOf(line.materialId)?.name ?? "Vật tư", quantity: line.quantity,
      symbol: materialOf(line.materialId)?.uoms.find((uom) => uom.id === line.uomId)?.symbol ?? "", totalVnd: discountedOk?.lines[index]?.lineTotalVnd ?? preview.lines?.[index]?.lineTotalVnd ?? null }))}
    totalVnd={discountedOk?.netTotalVnd ?? preview.totalVnd ?? null} grossVnd={preview.totalVnd ?? null} discountVnd={discountedOk?.discountTotalVnd ?? null}
    prepaid={prepaying && prepaidAmount && prepaidAccount ? { amountVnd: prepaidAmount, method: prepaymentMethodLabels[prepaidMethod], account: prepaidAccount.name } : null} onClose={() => setReviewOpen(false)} />}
    {priceLine && <LinePriceDialog row={lines.indexOf(priceLine) + 1} name={materialOf(priceLine.materialId)?.name ?? "Vật tư"}
      unit={materialOf(priceLine.materialId)?.uoms.find((uom) => uom.id === priceLine.uomId)?.symbol ?? ""}
      listUnitVnd={previewLines?.[lines.indexOf(priceLine)]?.unitPriceVnd ?? null}
      systemUnitVnd={!priceLine.manualPriceVnd ? previewLines?.[lines.indexOf(priceLine)]?.unitPriceVnd ?? null : null}
      manualPriceVnd={priceLine.manualPriceVnd} discount={{ mode: priceLine.discountMode ?? "", value: priceLine.discountValue ?? "" }} canManagePrice={canManagePrice}
      onClose={() => setPriceLineKey(null)}
      onChange={(change) => {
        const key = priceLine.key;
        const discount = change.discount ?? { mode: "", value: "" };
        const update = (line: EditorLine) => line.key === key ? { ...line, discountMode: discount.mode, discountValue: discount.value,
          ...(change.manualPriceVnd !== undefined ? { manualPriceVnd: change.manualPriceVnd, manualReason: change.manualPriceVnd ? line.manualReason : "" } : {}) } : line;
        // A new manual price is priced again by the server; a discount alone is worked out here.
        if (change.manualPriceVnd !== undefined && change.manualPriceVnd !== priceLine.manualPriceVnd) changeLines((current) => current.map(update));
        else { needPrice(); setLines((current) => current.map(update)); }
      }} />}{quickMode && <QuickCreatePanel key={quickMode} mode={quickMode} customerId={customerId} onClose={() => setQuickMode(null)}
    onCustomerCreated={(created) => { const option = { id: created.id, label: created.name }; siteLoadRevision.current += 1; setCustomerChoices((current) => [...current, option]); setSitesByCustomer((current) => ({ ...current, [created.id]: [] })); setCustomer(option); setSite(null); invalidate(); setQuickMode("site"); }}
    onSiteCreated={(created) => { siteLoadRevision.current += 1; setSitesByCustomer((current) => ({ ...current, [customerId]: [...(current[customerId] ?? []), created] })); setSite(siteOption(created)); invalidate(); setQuickMode(null); }} />}</>;
}
