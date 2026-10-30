"use client";

import Decimal from "decimal.js";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";
import { Minus, Plus, Search } from "lucide-react";
import type { EditorLine, EditorMaterial } from "@/components/documents/editor/types";
import { Dialog } from "@/components/ui/dialog";
import { formatBusinessDateTime, parseBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity, isExactEntryQuantity } from "@/lib/core/quantity";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { submitPortalOrderAction } from "@/modules/portal/order-actions";
import type { PortalCatalog, PortalCatalogItem } from "@/modules/portal/types";

const priceKey = (materialId: string, uomId: string) => `${materialId}:${uomId}`;
const NEW_SITE = "new";
const PICKED = "__picked";

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
 * "Đặt hàng" as in the approved portal concept (Khách · Đặt hàng): where to deliver on top, a search and one chip per
 * product group, a card per product with this customer's price, its units and − / + quantity, and the total pinned at
 * the bottom ("Xem & gửi đơn" opens the review). The order waits for the store to approve; nothing is reserved until
 * then, and prices are always taken again on the server.
 */
/** `initial`: an earlier order's goods and site ("Đặt lại", FB18). */
export function PortalOrderForm({ catalog, operationId: initialOperationId, initial }: { catalog: PortalCatalog; operationId: string;
  initial?: { lines: Array<{ materialId: string; uomId: string; quantity: string }>; siteId?: string; missing?: string[] } }) {
  const router = useRouter();
  const nextKey = useRef((initial?.lines.length ?? 0) + 1);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("");
  const [unitChoice, setUnitChoice] = useState<Record<string, string>>({});
  const materials = useMemo(() => portalMaterials(catalog.items), [catalog.items]);
  const prices = useMemo(() => new Map(catalog.items.map((item) => [priceKey(item.material_id, item.uom_id), item.unit_price_vnd])), [catalog.items]);
  const inStock = useMemo(() => new Map(catalog.items.map((item) => [item.material_id, item.in_stock])), [catalog.items]);
  const [lines, setLines] = useState<EditorLine[]>(() => (initial?.lines ?? []).map((line, index) => ({ key: index + 1, sourceLineId: "", materialId: line.materialId,
    uomId: line.uomId, quantity: line.quantity, manualPriceVnd: "", manualReason: "" })));
  const [site, setSite] = useState<string>(initial?.siteId ?? catalog.sites[0]?.id ?? NEW_SITE);
  const [newSite, setNewSite] = useState({ name: "", address: "", receiverName: "", receiverPhone: "" });
  const [requestedAt, setRequestedAt] = useState("");
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(initial?.missing?.length ? `Không còn bán theo bảng giá hiện tại: ${initial.missing.join("; ")}.` : null);
  const [operationId, setOperationId] = useState(initialOperationId);

  const materialOf = (id: string) => materials.find((material) => material.id === id);
  const priceOf = (line: EditorLine) => prices.get(priceKey(line.materialId, line.uomId)) ?? null;
  const total = lines.reduce((sum, line) => { const price = priceOf(line); return price ? sum + lineTotalVnd(line.quantity, price) : sum; }, 0n);
  const invalid = lines.some((line) => !isExactEntryQuantity(line.quantity) || !priceOf(line));
  const siteReady = site !== NEW_SITE || (newSite.name.trim().length >= 2 && newSite.address.trim().length >= 5);
  const chosenSite = catalog.sites.find((entry) => entry.id === site);
  const ready = lines.length > 0 && !invalid && siteReady;

  function change(update: (current: EditorLine[]) => EditorLine[]) { setLines(update); setMessage(null); }
  const lineOf = (materialId: string) => lines.find((line) => line.materialId === materialId);
  function add(material: EditorMaterial) {
    if (lines.length >= 50) { setMessage("Một đơn tối đa 50 dòng hàng."); return; }
    const uomId = unitChoice[material.id] ?? material.uoms[0]?.id ?? "";
    const key = nextKey.current;
    nextKey.current += 1;
    change((current) => [...current, { key, sourceLineId: "", materialId: material.id, uomId, quantity: "1", manualPriceVnd: "", manualReason: "" }]);
  }
  function step(line: EditorLine, delta: number) {
    const now = isExactEntryQuantity(line.quantity) ? new Decimal(line.quantity) : new Decimal(0);
    const next = now.plus(delta);
    if (next.lte(0)) { change((current) => current.filter((row) => row.key !== line.key)); return; }
    change((current) => current.map((row) => row.key === line.key ? { ...row, quantity: next.toFixed() } : row));
  }
  function chooseUnit(material: EditorMaterial, uomId: string) {
    setUnitChoice((all) => ({ ...all, [material.id]: uomId }));
    change((current) => current.map((row) => row.materialId === material.id ? { ...row, uomId } : row));
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
  const groups = [...new Set(materials.map((material) => material.group).filter((name): name is string => Boolean(name)))];
  const needle = query.trim().toLocaleLowerCase("vi-VN");
  const shown = materials.filter((material) => (group === "" || (group === PICKED ? Boolean(lineOf(material.id)) : material.group === group))
    && (!needle || `${material.name} ${material.code} ${material.variant?.label ?? ""}`.toLocaleLowerCase("vi-VN").includes(needle)));

  return <div className={styles.shop}>
    <section className={styles.shopPlace} aria-label="Giao tới">
      <div className="field"><label htmlFor="portal-order-site">Công trình / điểm giao</label>
        <select id="portal-order-site" value={site} onChange={(event) => { setSite(event.target.value); setMessage(null); }}>
          {catalog.sites.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          <option value={NEW_SITE}>+ Địa chỉ giao mới</option>
        </select>
        {chosenSite && <small className="muted">{chosenSite.address_text}{chosenSite.receiver_name || chosenSite.receiver_phone ? ` · Người nhận: ${[chosenSite.receiver_name, chosenSite.receiver_phone].filter(Boolean).join(" · ")}` : ""}</small>}
      </div>
      {site === NEW_SITE && <div className={styles.shopNewSite}>
        <div className="field"><label htmlFor="site-name">Tên công trình / nơi nhận</label><input id="site-name" value={newSite.name} maxLength={160}
          onChange={(event) => setNewSite({ ...newSite, name: event.target.value })} /></div>
        <div className="field"><label htmlFor="site-address">Địa chỉ</label><textarea id="site-address" rows={2} value={newSite.address} maxLength={300}
          onChange={(event) => setNewSite({ ...newSite, address: event.target.value })} /></div>
        <div className="field"><label htmlFor="site-receiver">Người nhận</label><input id="site-receiver" value={newSite.receiverName} maxLength={120}
          onChange={(event) => setNewSite({ ...newSite, receiverName: event.target.value })} /></div>
        <div className="field"><label htmlFor="site-phone">Số điện thoại người nhận</label><input id="site-phone" type="tel" inputMode="tel" value={newSite.receiverPhone} maxLength={60}
          onChange={(event) => setNewSite({ ...newSite, receiverPhone: event.target.value })} /></div>
      </div>}
      <label className={styles.shopSearch}><Search aria-hidden size={18} /><span className="sr-only">Tìm hàng</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm xi măng, thép, cát…" /></label>
      <div className={styles.shopChips} role="group" aria-label="Nhóm hàng">
        <button type="button" aria-pressed={group === ""} onClick={() => setGroup("")}>Tất cả</button>
        {lines.length > 0 && <button type="button" aria-pressed={group === PICKED} onClick={() => setGroup(PICKED)}>Đã chọn ({lines.length})</button>}
        {groups.map((name) => <button key={name} type="button" aria-pressed={group === name} onClick={() => setGroup(name)}>{name}</button>)}
      </div>
    </section>

    <ul className={styles.shopList} aria-label="Hàng của bạn">{shown.map((material) => {
      const line = lineOf(material.id);
      const uomId = line?.uomId ?? unitChoice[material.id] ?? material.uoms[0]?.id;
      const unit = material.uoms.find((uom) => uom.id === uomId);
      const price = unit ? prices.get(priceKey(material.id, unit.id)) : null;
      const baseSymbol = material.uoms.find((uom) => uom.ratio?.numerator === uom.ratio?.denominator)?.symbol ?? "";
      return <li key={material.id} className={styles.shopCard}>
        <div className={styles.shopName}><strong>{material.name}</strong>
          {material.variant?.label && <small>{material.variant.label}</small>}
          <span>{price && unit ? `${money(price)} / ${unit.symbol}` : "Chưa có giá"}{inStock.get(material.id) ? "" : " · Đặt trước"}</span>
          {unit?.ratio && unit.ratio.numerator !== unit.ratio.denominator && <small>1 {unit.symbol} = {formatQuantity(new Decimal(unit.ratio.numerator).div(unit.ratio.denominator).toString())} {baseSymbol}</small>}
        </div>
        <div className={styles.shopControls}>
          {material.uoms.length > 1 && <div className={styles.shopUnits} role="radiogroup" aria-label={`Đơn vị ${material.name}`}>
            {material.uoms.map((uom) => <button key={uom.id} type="button" role="radio" aria-checked={uom.id === uomId} onClick={() => chooseUnit(material, uom.id)}>{uom.symbol}</button>)}
          </div>}
          {line ? <div className={styles.stepper}>
            <button type="button" aria-label={`Bớt 1 ${material.name}`} onClick={() => step(line, -1)}><Minus aria-hidden size={18} /></button>
            <input aria-label={`Số lượng ${material.name}`} inputMode="decimal" value={line.quantity} aria-invalid={!isExactEntryQuantity(line.quantity) || undefined}
              onChange={(event) => change((current) => current.map((row) => row.key === line.key ? { ...row, quantity: event.target.value.replace(",", ".") } : row))} />
            <button type="button" aria-label={`Thêm 1 ${material.name}`} onClick={() => step(line, 1)}><Plus aria-hidden size={18} /></button>
          </div> : <button type="button" className={styles.shopAdd} disabled={!price} onClick={() => add(material)} aria-label={`Thêm ${material.name}`}>Thêm</button>}
        </div>
      </li>;
    })}</ul>
    {!shown.length && <p className={styles.empty}>Không có hàng phù hợp. Thử tìm tên khác hoặc chọn &quot;Tất cả&quot;.</p>}

    <div className={styles.shopExtra} role="group" aria-label="Ngày nhận và ghi chú">
      <div className="field"><label htmlFor="order-when">Muốn nhận lúc (để trống = sớm nhất)</label>
        <input id="order-when" type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} /></div>
      <div className="field"><label htmlFor="order-note">Ghi chú cho cửa hàng</label>
        <textarea id="order-note" rows={2} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: giao buổi sáng, xe nhỏ vào được" /></div>
    </div>

    <div className={styles.shopFooter} role="group" aria-label="Tổng tiền và gửi đơn">
      {message && !reviewing && <p className="form-message" role="status">{message}</p>}
      {lines.length > 0 && invalid && <p className={styles.hint}>Số lượng chỉ gồm chữ số, tối đa 6 chữ số thập phân (ví dụ 2,5).</p>}
      {lines.length > 0 && !siteReady && <p className={styles.hint}>Nhập tên và địa chỉ giao mới.</p>}
      <button type="button" className={styles.shopSubmit} disabled={!ready} onClick={() => setReviewing(true)}>
        <span className={styles.shopCount}>{lines.length}</span>
        <span><small>Tạm tính theo bảng giá</small><strong>{money(total.toString())}</strong></span>
        <span>Xem & gửi đơn</span>
      </button>
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
