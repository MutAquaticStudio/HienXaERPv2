"use client";

import Decimal from "decimal.js";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";
import { DocumentLineTable } from "@/components/documents/editor/document-line-table";
import { addMaterialLine } from "@/components/documents/editor/lines";
import { MaterialSearchBox, type MaterialSearchHandle } from "@/components/documents/editor/material-search-box";
import type { EditorLine, EditorMaterial } from "@/components/documents/editor/types";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDateTime, parseBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity, isExactEntryQuantity } from "@/lib/core/quantity";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { submitPortalOrderAction } from "@/modules/portal/order-actions";
import type { PortalCatalog, PortalCatalogItem } from "@/modules/portal/types";

const priceKey = (materialId: string, uomId: string) => `${materialId}:${uomId}`;
const NEW_SITE = "new";

/** Line total as stored: quantity × unit price, rounded half up to whole đồng. */
export function lineTotalVnd(quantity: string, unitPriceVnd: string) {
  if (!isExactEntryQuantity(quantity)) return 0n;
  return BigInt(new Decimal(quantity).mul(unitPriceVnd).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/**
 * The customer's catalog as the materials of the shared order editor: one entry per material with the units it has a
 * price in (the base unit first, as on the internal form) and its variant group, so variants of one product list together.
 */
export function portalMaterials(items: PortalCatalogItem[]): EditorMaterial[] {
  const byId = new Map<string, EditorMaterial>();
  for (const item of items) {
    const uom = { id: item.uom_id, symbol: item.uom_symbol, ratio: { numerator: item.conversion_numerator, denominator: item.conversion_denominator } };
    const known = byId.get(item.material_id);
    if (known) { if (!known.uoms.some((entry) => entry.id === uom.id)) known.uoms.push(uom); continue; }
    byId.set(item.material_id, { id: item.material_id, code: item.code, name: item.name, uoms: [uom], group: item.group_name,
      variant: item.variant_group_id ? { groupId: item.variant_group_id, name: item.variant_name ?? item.name, label: item.variant_label ?? "" } : undefined });
  }
  const isBase = (uom: EditorMaterial["uoms"][number]) => uom.ratio?.numerator === uom.ratio?.denominator;
  return [...byId.values()].map((material) => ({ ...material, uoms: [...material.uoms].sort((left, right) => Number(isBase(right)) - Number(isBase(left))) }));
}

/** Another variant of the same product on a line: the same unit when it is sold in it, else its first unit. */
export function switchVariant(line: EditorLine, materials: EditorMaterial[], targetId: string): EditorLine {
  const current = materials.find((material) => material.id === line.materialId);
  const target = materials.find((material) => material.id === targetId);
  if (!target) return line;
  const symbol = current?.uoms.find((uom) => uom.id === line.uomId)?.symbol;
  const uom = target.uoms.find((entry) => entry.id === line.uomId) ?? target.uoms.find((entry) => entry.symbol === symbol) ?? target.uoms[0];
  return { ...line, materialId: target.id, uomId: uom?.id ?? "" };
}

/**
 * FB6 "Đặt hàng" (Owner 18/10: same as the internal "Tạo đơn bán"): the shared product search that drops the list down
 * (variants of one product together), editable lines with unit, − / + quantity and this customer's price, the delivery
 * place, when to receive, the total pinned at the bottom and a review before sending. The order waits for the store to
 * approve; nothing is reserved until then, and prices are always taken again on the server.
 */
export function PortalOrderForm({ catalog, operationId: initialOperationId }: { catalog: PortalCatalog; operationId: string }) {
  const router = useRouter();
  const searchRef = useRef<MaterialSearchHandle>(null);
  const nextKey = useRef(1);
  const materials = useMemo(() => portalMaterials(catalog.items), [catalog.items]);
  const prices = useMemo(() => new Map(catalog.items.map((item) => [priceKey(item.material_id, item.uom_id), item.unit_price_vnd])), [catalog.items]);
  const inStock = useMemo(() => new Map(catalog.items.map((item) => [item.material_id, item.in_stock])), [catalog.items]);
  const [lines, setLines] = useState<EditorLine[]>([]);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [site, setSite] = useState<string>(catalog.sites[0]?.id ?? NEW_SITE);
  const [newSite, setNewSite] = useState({ name: "", address: "", receiverName: "", receiverPhone: "" });
  const [requestedAt, setRequestedAt] = useState("");
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [operationId, setOperationId] = useState(initialOperationId);

  const materialOf = (id: string) => materials.find((material) => material.id === id);
  const priceOf = (line: EditorLine) => prices.get(priceKey(line.materialId, line.uomId)) ?? null;
  const total = lines.reduce((sum, line) => { const price = priceOf(line); return price ? sum + lineTotalVnd(line.quantity, price) : sum; }, 0n);
  const invalid = lines.some((line) => !isExactEntryQuantity(line.quantity) || !priceOf(line));
  const siteReady = site !== NEW_SITE || (newSite.name.trim().length >= 2 && newSite.address.trim().length >= 5);
  const chosenSite = catalog.sites.find((entry) => entry.id === site);
  const ready = lines.length > 0 && !invalid && siteReady;

  function change(update: (current: EditorLine[]) => EditorLine[]) { setLines(update); setMessage(null); }
  function pick(material: EditorMaterial) {
    const result = addMaterialLine(lines, material, nextKey.current);
    if (!result) { setMessage("Một đơn tối đa 50 dòng hàng."); return; }
    if (result.focusKey === nextKey.current) nextKey.current += 1;
    change(() => result.lines);
    setFocusKey(result.focusKey);
    setFocusSeq((seq) => seq + 1);
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await submitPortalOrderAction({
        customerId: catalog.customer.id, siteId: site === NEW_SITE ? null : site, newSite: site === NEW_SITE ? newSite : null,
        requestedAt, note, operationId,
        lines: lines.map((line) => ({ materialId: line.materialId, uomId: line.uomId, quantity: line.quantity })),
      });
      if (outcome.status === "SUCCESS") { router.push(`/customer/orders/${outcome.resultId}?notice=submitted`); return; }
      // A rejected order can be corrected and sent as a new one; an unknown result is retried with the same operation.
      if (outcome.status === "FAILED") setOperationId(crypto.randomUUID());
      setMessage(outcome.message);
    } catch {
      setMessage("Chưa rõ đơn đã gửi chưa (mất kết nối). Bấm “Gửi đơn” lần nữa — hệ thống không tạo đơn trùng.");
    } finally {
      setBusy(false);
    }
  }

  if (!catalog.items.length) return <p className={styles.empty}>Cửa hàng chưa mở bán mặt hàng nào cho tài khoản của bạn. Liên hệ cửa hàng để được báo giá.</p>;

  const symbolOf = (line: EditorLine) => materialOf(line.materialId)?.uoms.find((uom) => uom.id === line.uomId)?.symbol ?? "";
  const whenText = requestedAt && parseBusinessDateTime(requestedAt) ? formatBusinessDateTime(parseBusinessDateTime(requestedAt)!) : "Sớm nhất có thể";

  return <div className={`doc-editor ${styles.orderEditor}`}>
    <section className="card doc-editor-main" aria-label="Dòng hàng">
      <div className="doc-editor-toolbar"><MaterialSearchBox ref={searchRef} materials={materials} onPick={pick} label="Tìm hàng" placeholder="Tìm hàng theo tên hoặc mã"
        hint={(material) => { const unit = material.uoms[0]; const price = unit ? prices.get(priceKey(material.id, unit.id)) : null;
          return [price && unit ? `${money(price)} / ${unit.symbol}` : null, inStock.get(material.id) ? "Còn hàng" : "Đặt trước"].filter(Boolean).join(" · "); }} /></div>
      <DocumentLineTable lines={lines} materials={materials} canManagePrice={false} isValidQuantity={isExactEntryQuantity} focusKey={focusKey} focusSeq={focusSeq}
        labels={{ uom: "Đơn vị", price: "Đơn giá" }}
        emptyText="Chưa có hàng trong đơn. Bấm ô tìm hàng ở trên để xem danh sách và chọn."
        priced={(index) => { const line = lines[index]; const price = line ? priceOf(line) : null;
          return price ? { unitPriceVnd: price, lineTotalVnd: lineTotalVnd(line.quantity, price).toString(), sourceLabel: "Giá của bạn" } : null; }}
        onChange={(key, update) => change((current) => current.map((line) => line.key === key ? { ...line, ...update } : line))}
        onRemove={(key) => { change((current) => current.filter((line) => line.key !== key)); searchRef.current?.focus(); }}
        onDone={() => searchRef.current?.focus()}
        detail={(line, index) => {
          const material = materialOf(line.materialId);
          const siblings = material?.variant ? materials.filter((entry) => entry.variant?.groupId === material.variant!.groupId) : [];
          const unit = material?.uoms.find((uom) => uom.id === line.uomId);
          return <span className={styles.lineMeta}>
            {siblings.length > 1 && <label className="doc-editor-reason">Loại
              <select aria-label={`Loại hàng dòng ${index + 1}`} value={line.materialId}
                onChange={(event) => change((current) => current.map((row) => row.key === line.key ? switchVariant(row, materials, event.target.value) : row))}>
                {siblings.map((entry) => <option key={entry.id} value={entry.id}>{entry.variant?.label || entry.name}</option>)}
              </select></label>}
            {unit?.ratio && unit.ratio.numerator !== unit.ratio.denominator && material && <small className="muted">
              1 {unit.symbol} = {formatQuantity(new Decimal(unit.ratio.numerator).div(unit.ratio.denominator).toString())} {material.uoms.find((uom) => uom.ratio?.numerator === uom.ratio?.denominator)?.symbol ?? ""}</small>}
            {inStock.get(line.materialId) ? <StatusBadge tone="success">Còn hàng</StatusBadge> : <StatusBadge tone="warning">Đặt trước</StatusBadge>}
          </span>;
        }} />
    </section>

    <div className="doc-editor-rail">
      <aside className="card card-pad doc-editor-side" aria-label="Giao tới">
        <div className="doc-editor-entity"><span className="doc-editor-label">Khách hàng</span><strong>{catalog.customer.display_name}</strong></div>
        <div className="field"><label htmlFor="portal-order-site">Công trình / điểm giao</label>
          <select id="portal-order-site" value={site} onChange={(event) => { setSite(event.target.value); setMessage(null); }}>
            {catalog.sites.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            <option value={NEW_SITE}>+ Địa chỉ giao mới</option>
          </select>
          {chosenSite && <small className="muted">{chosenSite.address_text}{chosenSite.receiver_name || chosenSite.receiver_phone ? ` · Người nhận: ${[chosenSite.receiver_name, chosenSite.receiver_phone].filter(Boolean).join(" · ")}` : ""}</small>}
        </div>
        {site === NEW_SITE && <>
          <div className="field"><label htmlFor="site-name">Tên công trình / nơi nhận</label><input id="site-name" value={newSite.name} maxLength={160}
            onChange={(event) => setNewSite({ ...newSite, name: event.target.value })} /></div>
          <div className="field"><label htmlFor="site-address">Địa chỉ</label><textarea id="site-address" rows={2} value={newSite.address} maxLength={300}
            onChange={(event) => setNewSite({ ...newSite, address: event.target.value })} /></div>
          <div className="field"><label htmlFor="site-receiver">Người nhận</label><input id="site-receiver" value={newSite.receiverName} maxLength={120}
            onChange={(event) => setNewSite({ ...newSite, receiverName: event.target.value })} /></div>
          <div className="field"><label htmlFor="site-phone">Số điện thoại người nhận</label><input id="site-phone" type="tel" inputMode="tel" value={newSite.receiverPhone} maxLength={60}
            onChange={(event) => setNewSite({ ...newSite, receiverPhone: event.target.value })} /></div>
        </>}
      </aside>

      <div className="card card-pad doc-editor-footer" role="group" aria-label="Tổng tiền và gửi đơn">
        {message && !reviewing && <p className="form-message" role="status">{message}</p>}
        <div className="doc-editor-totals"><dl className="doc-editor-summary">
          <div><dt>Số dòng</dt><dd>{lines.length}</dd></div>
          <div className="doc-editor-total"><dt>Tạm tính</dt><dd>{money(total.toString())}</dd></div>
        </dl>
          {lines.length > 0 && invalid && <p className="doc-editor-total-hint">Số lượng chỉ gồm chữ số, tối đa 6 chữ số thập phân (ví dụ 2,5).</p>}
          {lines.length > 0 && !siteReady && <p className="doc-editor-total-hint">Nhập tên và địa chỉ giao mới.</p>}</div>
        <div className="doc-editor-actions">
          <button className="button button-primary" type="button" disabled={!ready} onClick={() => setReviewing(true)}>Xem lại đơn</button>
        </div>
        <p className="muted doc-editor-hint">Giá theo bảng giá của bạn. Cửa hàng duyệt đơn rồi báo ngày giao; chưa giữ hàng cho tới khi duyệt.</p>
      </div>
    </div>

    <div className="card card-pad doc-editor-extra" role="group" aria-label="Ngày nhận và ghi chú">
      <div className="field"><label htmlFor="order-when">Muốn nhận lúc (để trống = sớm nhất)</label>
        <input id="order-when" type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} /></div>
      <div className="field"><label htmlFor="order-note">Ghi chú cho cửa hàng</label>
        <textarea id="order-note" rows={2} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: giao buổi sáng, xe nhỏ vào được" /></div>
    </div>

    {reviewing && <Dialog eyebrow="Kiểm tra trước khi gửi" title="Xem lại đơn" onClose={() => { if (!busy) setReviewing(false); }} initialFocusId="portal-order-send">
      <dl className="detail-grid order-review-summary">
        <div className="detail-item"><dt>Giao tới</dt><dd>{chosenSite ? `${chosenSite.name} — ${chosenSite.address_text}` : `${newSite.name} — ${newSite.address}`}</dd></div>
        <div className="detail-item"><dt>Muốn nhận</dt><dd>{whenText}</dd></div>
        {note && <div className="detail-item"><dt>Ghi chú</dt><dd>{note}</dd></div>}
        <div className="detail-item"><dt>Số dòng</dt><dd>{lines.length}</dd></div>
        <div className="detail-item"><dt>Tạm tính</dt><dd><strong>{money(total.toString())}</strong></dd></div>
      </dl>
      <div className="table-wrap"><table className="order-review-lines">
        <thead><tr><th scope="col">Hàng</th><th scope="col" className="numeric">Số lượng</th><th scope="col" className="numeric">Thành tiền</th></tr></thead>
        <tbody>{lines.map((line) => { const material = materialOf(line.materialId); const price = priceOf(line);
          return <tr key={line.key}><td>{material?.name}{material?.variant?.label && <small className="table-subline">{material.variant.label}</small>}</td>
            <td className="numeric">{formatQuantity(line.quantity)} {symbolOf(line)}{price && <small className="table-subline">× {money(price)}</small>}</td>
            <td className="numeric">{price ? money(lineTotalVnd(line.quantity, price).toString()) : "—"}</td></tr>; })}</tbody>
      </table></div>
      <p className="muted">Giá theo bảng giá hiện tại của bạn. Cửa hàng duyệt đơn rồi báo ngày giao; chưa giữ hàng cho tới khi duyệt.</p>
      {message && <p className="form-message" role="status">{message}</p>}
      <div className="form-actions">
        <button id="portal-order-send" className="button button-primary" type="button" disabled={busy} onClick={() => { void send(); }}>{busy ? "Đang gửi..." : "Gửi đơn"}</button>
        <button className="button button-secondary" type="button" disabled={busy} onClick={() => setReviewing(false)}>Sửa đơn</button>
      </div>
    </Dialog>}
  </div>;
}
