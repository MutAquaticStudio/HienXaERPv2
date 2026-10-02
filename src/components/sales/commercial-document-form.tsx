"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { formatVnd, vnd } from "@/lib/core/money";
import { createCustomerQuickAction, createSiteQuickAction } from "@/modules/customers/actions";
import { createQuotationAction, createSalesOrderAction, previewCommercialDocumentAction, updateQuotationDraftAction, updateSalesOrderDraftAction, type PricePreviewResult } from "@/modules/sales/actions";
import { searchSalesCustomersAction, searchSalesSitesAction } from "@/modules/sales/form-lookup-actions";
import type { SalesFormOptions } from "@/modules/sales/form-options";

export type ExistingCommercialDraft = {
  id: string; version: number; customerId: string; siteId: string;
  effectiveAt: string | null; terms: string | null;
  lines: { sourceLineId: string; materialId: string; uomId: string; quantity: string; manualPriceVnd: string; manualReason: string }[];
};

function localDateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)).replace(" ", "T");
}

function QuickCreatePanel({ mode, customerId, onCustomerCreated, onSiteCreated, onClose }: {
  mode: "customer" | "site"; customerId: string;
  onCustomerCreated: (customer: { id: string; name: string }) => void;
  onSiteCreated: (site: { id: string; name: string; address: string }) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { document.getElementById("quick-create-code")?.focus(); }, [mode]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  return <div className="quick-create-backdrop" role="presentation"><section className="quick-create-panel card" role="dialog" aria-modal="true" aria-labelledby="quick-create-title">
    <div className="commercial-line-head"><div><p className="eyebrow">Tạo nhanh trong Sales</p><h2 id="quick-create-title">{mode === "customer" ? "Thêm khách hàng" : "Thêm công trình"}</h2></div><button className="button button-secondary" type="button" onClick={onClose}>Đóng</button></div>
    <p className="muted">Bản nháp hiện tại được giữ nguyên. Sau khi tạo, bản ghi mới sẽ được chọn tự động.</p>
    <form onSubmit={submit} className="form-grid">
      {mode === "site" && <input type="hidden" name="customerId" value={customerId} />}
      <div className="field"><label htmlFor="quick-create-code">Mã *</label><input id="quick-create-code" name="code" required minLength={2} maxLength={32} /></div>
      <div className="field"><label htmlFor="quick-create-name">{mode === "customer" ? "Tên khách hàng" : "Tên công trình"} *</label><input id="quick-create-name" name="name" required minLength={2} maxLength={160} /></div>
      {mode === "customer" ? <div className="field"><label htmlFor="quick-create-phone">Điện thoại</label><input id="quick-create-phone" name="phone" maxLength={60} /></div> : <><div className="field field-full"><label htmlFor="quick-create-address">Địa chỉ giao hàng *</label><input id="quick-create-address" name="address" required minLength={3} maxLength={500} /></div><div className="field"><label htmlFor="quick-create-receiver">Người nhận</label><input id="quick-create-receiver" name="receiverName" maxLength={120} /></div><div className="field"><label htmlFor="quick-create-receiver-phone">Điện thoại người nhận</label><input id="quick-create-receiver-phone" name="receiverPhone" maxLength={60} /></div></>}
      {message && <p className="form-message field-full" role="status">{message}</p>}
      <div className="form-actions field-full"><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang tạo..." : mode === "customer" ? "Tạo khách hàng" : "Tạo công trình"}</button></div>
    </form>
  </section></div>;
}

export function CommercialDocumentForm({ kind, options, operationId, canManagePrice, canManageCustomers, existing, initialCustomerId, initialSiteId }: { kind: "order" | "quote"; options: SalesFormOptions; operationId: string; canManagePrice: boolean; canManageCustomers: boolean; existing?: ExistingCommercialDraft; initialCustomerId?: string; initialSiteId?: string }) {
  const action = existing ? (kind === "order" ? updateSalesOrderDraftAction : updateQuotationDraftAction) : (kind === "order" ? createSalesOrderAction : createQuotationAction);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [customerOptions, setCustomerOptions] = useState(options.customers);
  const initialCustomer = options.customers.find((item) => item.id === initialCustomerId) ?? options.customers[0];
  const initialSite = initialCustomer?.sites.find((item) => item.id === initialSiteId) ?? initialCustomer?.sites[0];
  const [customerId, setCustomerId] = useState(existing?.customerId ?? initialCustomer?.id ?? "");
  const [siteId, setSiteId] = useState(existing?.siteId ?? initialSite?.id ?? "");
  const [terms, setTerms] = useState(existing?.terms ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [customerLookupPending, setCustomerLookupPending] = useState(false);
  const [siteLookupPending, setSiteLookupPending] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const customerSearchRevision = useRef(0);
  const siteSearchRevision = useRef(0);
  const [quickMode, setQuickMode] = useState<"customer" | "site" | null>(null);
  const nextLineKey = useRef(existing?.lines.length ?? 1);
  const priceRevision = useRef(0);
  const [previewRecord, setPreviewRecord] = useState<{ state: typeof state; value: PricePreviewResult } | null>(null);
  const preview = previewRecord?.state === state ? previewRecord?.value ?? null : null;
  function setPreview(next: PricePreviewResult | null) { setPreviewRecord(next ? { state, value: next } : null); }
  const [previewPending, setPreviewPending] = useState(false);
  const [lines, setLines] = useState(existing ? existing.lines.map((line, key) => ({ ...line, key })) : [{ key: 0, sourceLineId: "", materialId: options.materials[0]?.id ?? "", uomId: options.materials[0]?.uoms[0]?.id ?? "", quantity: "", manualPriceVnd: "", manualReason: "" }]);
  const sites = useMemo(() => customerOptions.find((item) => item.id === customerId)?.sites ?? [], [customerId, customerOptions]);
  const empty = !customerOptions.length || !options.materials.length || !siteId || lines.some((line) => !line.materialId || !line.uomId || !line.quantity);
  function invalidatePrice() { priceRevision.current += 1; setPreview(null); }
  async function searchCustomers() {
    const revision = ++customerSearchRevision.current;
    setCustomerLookupPending(true);
    try {
      const found = await searchSalesCustomersAction(kind, customerSearch);
      if (revision !== customerSearchRevision.current) return;
      setCustomerOptions((current) => {
        const choices = found.map((item) => ({ ...item, sites: current.find((row) => row.id === item.id)?.sites ?? [] }));
        const selected = current.find((row) => row.id === customerId);
        return selected && !choices.some((row) => row.id === selected.id) ? [selected, ...choices] : choices;
      });
      setLookupMessage(found.length ? "" : "Không tìm thấy khách hàng phù hợp.");
    } catch { if (revision === customerSearchRevision.current) setLookupMessage("Không thể tìm khách hàng. Thử lại sau."); }
    finally { if (revision === customerSearchRevision.current) setCustomerLookupPending(false); }
  }
  async function searchSites(targetCustomerId: string, term: string) {
    const revision = ++siteSearchRevision.current;
    setSiteLookupPending(true);
    try {
      const found = await searchSalesSitesAction(kind, targetCustomerId, term);
      if (revision !== siteSearchRevision.current) return;
      setCustomerOptions((current) => current.map((customer) => {
        if (customer.id !== targetCustomerId) return customer;
        const selected = customer.sites.find((site) => site.id === siteId);
        const nextSites = selected && !found.some((site) => site.id === selected.id) ? [selected, ...found] : found;
        return { ...customer, sites: nextSites };
      }));
      setSiteId((current) => current || found[0]?.id || "");
      setLookupMessage(found.length ? "" : "Không tìm thấy công trình phù hợp.");
    } catch { if (revision === siteSearchRevision.current) setLookupMessage("Không thể tìm công trình. Thử lại sau."); }
    finally { if (revision === siteSearchRevision.current) setSiteLookupPending(false); }
  }
  function updateLine(key: number, change: Partial<(typeof lines)[number]>) {
    invalidatePrice();
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line));
  }
  function addLine() {
    if (lines.length >= 50 || !options.materials.length) return;
    invalidatePrice();
    const material = options.materials[0];
    const key = nextLineKey.current++;
    setLines((current) => [...current, { key, sourceLineId: "", materialId: material.id, uomId: material.uoms[0]?.id ?? "", quantity: "", manualPriceVnd: "", manualReason: "" }]);
  }
  async function loadPreview() {
    if (empty) { setPreview({ success: false, message: "Chọn khách, công trình và nhập đủ dòng hàng trước khi xem giá." }); return; }
    const requestRevision = priceRevision.current;
    setPreviewPending(true);
    try {
      const result = await previewCommercialDocumentAction({ kind, customerId, siteId,
        documentId: existing?.id, expectedVersion: existing?.version,
        lines: lines.map((line) => ({ materialId: line.materialId, orderedUomId: line.uomId, quantity: line.quantity,
          manualPriceVnd: line.manualPriceVnd, manualReason: line.manualReason, sourceLineId: line.sourceLineId })) });
      if (requestRevision === priceRevision.current) setPreview(result);
    } catch { if (requestRevision === priceRevision.current) setPreview({ success: false, message: "Không thể xem trước giá. Thử lại sau." }); }
    finally { setPreviewPending(false); }
  }
  return <><form className="card card-pad" action={formAction}>
    <input type="hidden" name="operationId" value={operationId} />
    {existing && <><input type="hidden" name="documentId" value={existing.id} /><input type="hidden" name="expectedVersion" value={existing.version} /><input type="hidden" name="customerId" value={existing.customerId} /><input type="hidden" name="siteId" value={existing.siteId} /></>}
    <input type="hidden" name="pricePreview" value={preview?.success ? JSON.stringify(preview.lines) : ""} />
    <div className="form-grid">
      <div className="field"><div className="field-label-row"><label htmlFor="customerId">Khách hàng</label>{!existing && canManageCustomers && <button type="button" className="quick-create-trigger" onClick={() => setQuickMode("customer")}>+ Thêm khách</button>}</div>{!existing && <div className="field-label-row"><input aria-label="Tìm khách hàng" type="search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCustomers(); } }} placeholder="Mã hoặc tên khách" /><button className="button button-secondary" type="button" disabled={customerLookupPending} onClick={() => void searchCustomers()}>{customerLookupPending ? "Đang tìm..." : "Tìm khách"}</button></div>}<select id="customerId" name="customerId" value={customerId} disabled={!!existing} onChange={(event) => { const next = event.target.value; siteSearchRevision.current += 1; setCustomerId(next); setSiteId(""); setSiteSearch(""); invalidatePrice(); if (next) void searchSites(next, ""); }} required><option value="">Chọn khách hàng...</option>{customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
      <div className="field"><div className="field-label-row"><label htmlFor="siteId">Công trình / điểm giao</label>{!existing && canManageCustomers && <button type="button" className="quick-create-trigger" onClick={() => setQuickMode("site")} disabled={!customerId}>+ Thêm công trình</button>}</div>{!existing && <div className="field-label-row"><input aria-label="Tìm công trình" type="search" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (customerId) void searchSites(customerId, siteSearch); } }} placeholder="Mã, tên hoặc địa chỉ" disabled={!customerId} /><button className="button button-secondary" type="button" disabled={!customerId || siteLookupPending} onClick={() => void searchSites(customerId, siteSearch)}>{siteLookupPending ? "Đang tìm..." : "Tìm điểm"}</button></div>}<select id="siteId" name="siteId" value={siteId} disabled={!!existing} onChange={(event) => { setSiteId(event.target.value); invalidatePrice(); }} required><option value="">Chọn công trình...</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.address}</option>)}</select></div>
      {lookupMessage && <p className="form-message field-full" role="status">{lookupMessage}</p>}
      <div className="field"><label htmlFor="effectiveAt">{kind === "order" ? "Ngày giao dự kiến" : "Hiệu lực đến"}</label><input id="effectiveAt" name="effectiveAt" type="datetime-local" defaultValue={localDateTime(existing?.effectiveAt ?? null)} required={kind === "quote"} /></div>
      <div className="field field-full"><label htmlFor="terms">Điều khoản / ghi chú</label><textarea id="terms" name="terms" maxLength={1000} aria-describedby="terms-hint" value={terms} onChange={(event) => setTerms(event.target.value)} placeholder="Điều kiện giao, thanh toán hoặc lưu ý cho khách hàng" /><small id="terms-hint" className="muted">Tối đa 1.000 ký tự · {terms.length}/1.000</small></div>
    </div>
    <div className="section-head flush"><h2>Dòng hàng</h2><span className="muted">{lines.length} / 50 dòng</span></div>
    <div className="commercial-line-stack">{lines.map((line, index) => {
      const uoms = options.materials.find((material) => material.id === line.materialId)?.uoms ?? [];
      return <div className="commercial-line" key={line.key}>
        <input type="hidden" name="sourceLineId" value={line.sourceLineId} />
        {!canManagePrice && <><input type="hidden" name="manualPriceVnd" value={line.manualPriceVnd} /><input type="hidden" name="manualReason" value={line.manualReason} /></>}
        <div className="commercial-line-head"><strong>Dòng {index + 1}</strong><button className="button button-secondary" type="button" onClick={() => { invalidatePrice(); setLines((current) => current.filter((item) => item.key !== line.key)); }} disabled={lines.length === 1}>Xóa dòng</button></div>
        <div className="commercial-line-grid">
          <div className="field"><label htmlFor={`material-${line.key}`}>Vật tư *</label><select id={`material-${line.key}`} name="materialId" value={line.materialId} onChange={(event) => { const material = options.materials.find((item) => item.id === event.target.value); updateLine(line.key, { materialId: event.target.value, uomId: material?.uoms[0]?.id ?? "" }); }} required>{options.materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></div>
          <div className="field"><label htmlFor={`uom-${line.key}`}>Đơn vị bán *</label><select id={`uom-${line.key}`} name="orderedUomId" value={line.uomId} onChange={(event) => updateLine(line.key, { uomId: event.target.value })} required>{uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.symbol}</option>)}</select></div>
          <div className="field"><label htmlFor={`quantity-${line.key}`}>Số lượng *</label><input id={`quantity-${line.key}`} name="quantity" inputMode="decimal" placeholder="1" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required /></div>
          {canManagePrice && <><div className="field"><label htmlFor={`manual-price-${line.key}`}>Giá thủ công (VND, nếu cần)</label><input id={`manual-price-${line.key}`} name="manualPriceVnd" inputMode="numeric" value={line.manualPriceVnd} onChange={(event) => updateLine(line.key, { manualPriceVnd: event.target.value })} /></div><div className="field"><label htmlFor={`manual-reason-${line.key}`}>Lý do giá thủ công</label><input id={`manual-reason-${line.key}`} name="manualReason" maxLength={500} value={line.manualReason} onChange={(event) => updateLine(line.key, { manualReason: event.target.value })} /></div></>}
        </div>
        {!canManagePrice && line.manualPriceVnd && <p className="muted">Giá thủ công đã duyệt: {formatVnd(vnd(line.manualPriceVnd))}. Bạn có thể sửa số lượng; đổi giá hoặc UOM cần quyền quản lý giá.</p>}
        {preview?.success && preview.lines?.[index] ? <div className="commercial-price-strip"><span>Đơn giá: <strong>{formatVnd(vnd(preview.lines[index].unitPriceVnd))}</strong></span><span>Nguồn: <strong>{preview.lines[index].priceSourceType}</strong></span><span>Thành tiền: <strong>{formatVnd(vnd(preview.lines[index].lineTotalVnd))}</strong></span></div> : <p className="muted">Chưa xem trước giá dòng này.</p>}
      </div>;
    })}</div>
    <button className="button button-secondary" type="button" onClick={addLine} disabled={lines.length >= 50 || !options.materials.length}>+ Thêm dòng</button>
    <div className="commercial-preview"><button className="button button-secondary" type="button" onClick={loadPreview} disabled={pending || previewPending || empty}>{previewPending ? "Đang tính giá..." : "Tính giá và xem trước"}</button>{preview?.success && preview.totalVnd && <div className="commercial-preview-total"><span>Tạm tính <strong>{formatVnd(vnd(preview.totalVnd))}</strong></span><span>Tổng <strong>{formatVnd(vnd(preview.totalVnd))}</strong></span></div>}</div>
    {preview?.message && <p role="status" className={`form-message${preview.success ? " success" : ""}`}>{preview.message}</p>}
    <p className="muted form-hint">Giá được kiểm lại khi lưu. Nếu chính sách giá thay đổi sau khi xem trước, cần xem trước lại; không mặc định giá bằng 0.</p>
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    <div className="form-actions"><button className="button button-primary" type="submit" disabled={pending || empty || !preview?.success}>{pending ? "Đang lưu..." : existing ? "Lưu thay đổi bản nháp" : "Lưu bản nháp"}</button></div>
  </form>{quickMode && <QuickCreatePanel key={quickMode} mode={quickMode} customerId={customerId} onClose={() => setQuickMode(null)}
    onCustomerCreated={(customer) => { customerSearchRevision.current += 1; siteSearchRevision.current += 1; setCustomerOptions((current) => [...current, { ...customer, sites: [] }]); setCustomerId(customer.id); setSiteId(""); invalidatePrice(); setQuickMode("site"); }}
    onSiteCreated={(site) => { siteSearchRevision.current += 1; setCustomerOptions((current) => current.map((customer) => customer.id === customerId ? { ...customer, sites: [...customer.sites, site] } : customer)); setSiteId(site.id); invalidatePrice(); setQuickMode(null); }} />}</>;
}
