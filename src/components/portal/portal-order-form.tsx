"use client";

import Decimal from "decimal.js";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";
import { formatBusinessDateTime, parseBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity, isExactEntryQuantity } from "@/lib/core/quantity";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { submitPortalOrderAction } from "@/modules/portal/order-actions";
import type { PortalCatalog, PortalCatalogItem } from "@/modules/portal/types";

const keyOf = (item: Pick<PortalCatalogItem, "material_id" | "uom_id">) => `${item.material_id}:${item.uom_id}`;

/** Line total as stored: quantity × unit price, rounded half up to whole đồng. */
export function lineTotalVnd(quantity: string, unitPriceVnd: string) {
  if (!isExactEntryQuantity(quantity)) return 0n;
  return BigInt(new Decimal(quantity).mul(unitPriceVnd).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

function step(value: string, delta: number) {
  const current = isExactEntryQuantity(value) ? new Decimal(value) : new Decimal(0);
  const next = Decimal.max(0, current.plus(delta));
  return next.isZero() ? "" : next.toString();
}

/**
 * D15 "Đặt hàng" (mobile first): pick goods at this customer's prices, a delivery address and when to receive, check the
 * summary, send. The order waits for the store to approve; nothing is reserved until then.
 */
export function PortalOrderForm({ catalog, operationId: initialOperationId }: { catalog: PortalCatalog; operationId: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, string>>({});
  const [site, setSite] = useState<string>(catalog.sites[0]?.id ?? "new");
  const [newSite, setNewSite] = useState({ name: "", address: "", receiverName: "", receiverPhone: "" });
  const [requestedAt, setRequestedAt] = useState("");
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [operationId, setOperationId] = useState(initialOperationId);

  const byKey = useMemo(() => new Map(catalog.items.map((item) => [keyOf(item), item])), [catalog.items]);
  const picked = Object.entries(cart).filter(([, quantity]) => isExactEntryQuantity(quantity)).map(([key, quantity]) => ({ item: byKey.get(key)!, quantity }))
    .filter((line) => line.item);
  const total = picked.reduce((sum, line) => sum + lineTotalVnd(line.quantity, line.item.unit_price_vnd), 0n);
  const needle = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const visible = catalog.items.filter((item) => !needle || `${item.name} ${item.code} ${item.group_name}`.toLowerCase().includes(needle));
    const map = new Map<string, PortalCatalogItem[]>();
    for (const item of visible) map.set(item.group_name, [...(map.get(item.group_name) ?? []), item]);
    return [...map.entries()];
  }, [catalog.items, needle]);
  const invalid = Object.values(cart).some((quantity) => quantity !== "" && !isExactEntryQuantity(quantity));
  const siteReady = site !== "new" || (newSite.name.trim().length >= 2 && newSite.address.trim().length >= 5);
  const chosenSite = catalog.sites.find((entry) => entry.id === site);

  const setQuantity = (key: string, value: string) => { setCart((current) => ({ ...current, [key]: value.replace(",", ".") })); setMessage(null); };

  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await submitPortalOrderAction({
        customerId: catalog.customer.id, siteId: site === "new" ? null : site, newSite: site === "new" ? newSite : null,
        requestedAt, note, operationId,
        lines: picked.map((line) => ({ materialId: line.item.material_id, uomId: line.item.uom_id, quantity: line.quantity })),
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

  if (reviewing) return <section className={styles.card} aria-labelledby="review-title">
    <h2 id="review-title">Xem lại đơn</h2>
    <ul className={styles.orderLines}>{picked.map((line) => <li key={keyOf(line.item)}>
      <span>{line.item.name}<br /><small className={styles.hint}>{formatQuantity(line.quantity)} {line.item.uom_symbol} × {money(line.item.unit_price_vnd)}</small></span>
      <strong>{money(lineTotalVnd(line.quantity, line.item.unit_price_vnd).toString())}</strong></li>)}</ul>
    <div className={styles.kv}><span>Tạm tính</span><strong>{money(total.toString())}</strong></div>
    <div className={styles.kv}><span>Giao tới</span><strong>{chosenSite ? `${chosenSite.name} — ${chosenSite.address_text}` : `${newSite.name} — ${newSite.address}`}</strong></div>
    <div className={styles.kv}><span>Muốn nhận</span><strong>{requestedAt && parseBusinessDateTime(requestedAt) ? formatBusinessDateTime(parseBusinessDateTime(requestedAt)!) : "Sớm nhất có thể"}</strong></div>
    {note && <div className={styles.kv}><span>Ghi chú</span><strong>{note}</strong></div>}
    <p className={styles.hint}>Giá theo bảng giá hiện tại của bạn. Cửa hàng duyệt đơn rồi báo ngày giao; chưa giữ hàng cho tới khi duyệt.</p>
    {message && <p className={styles.status} role="status">{message}</p>}
    <div className={styles.actions}>
      <button className={styles.button} type="button" disabled={busy} onClick={() => { void send(); }}>{busy ? "Đang gửi..." : "Gửi đơn"}</button>
      <button className={styles.buttonSecondary} type="button" disabled={busy} onClick={() => setReviewing(false)}>Sửa đơn</button>
    </div>
  </section>;

  return <div className={styles.form}>
    <div className={`${styles.field} ${styles.orderSearch}`}><label htmlFor="order-search">Tìm hàng</label>
      <input id="order-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Xi măng, gạch, cát..." /></div>
    {groups.length ? groups.map(([group, items]) => <section className={styles.orderGroup} key={group} aria-label={group}>
      <h2>{group}</h2>
      {items.map((item) => {
        const key = keyOf(item);
        const quantity = cart[key] ?? "";
        const inputId = `qty-${key}`;
        return <article className={`${styles.orderItem} ${isExactEntryQuantity(quantity) ? styles.orderItemPicked : ""}`} key={key}>
          <div><strong>{item.name}</strong>
            <span className={styles.hint}>{money(item.unit_price_vnd)} / {item.uom_symbol}{item.conversion_numerator !== "1" || item.conversion_denominator !== "1"
              ? ` (${formatQuantity(new Decimal(item.conversion_numerator).div(item.conversion_denominator).toString())} ${item.base_symbol})` : ""}</span>
            <span className={`${styles.badge} ${item.in_stock ? "" : styles.badgeWarm}`}>{item.in_stock ? "Còn hàng" : "Đặt trước"}</span></div>
          <div className={styles.stepper}>
            <button type="button" aria-label={`Bớt ${item.name}`} onClick={() => setQuantity(key, step(quantity, -1))}>−</button>
            <input id={inputId} aria-label={`Số lượng ${item.name} (${item.uom_symbol})`} inputMode="decimal" value={quantity} placeholder="0"
              onChange={(event) => setQuantity(key, event.target.value.trim())} />
            <button type="button" aria-label={`Thêm ${item.name}`} onClick={() => setQuantity(key, step(quantity, 1))}>+</button>
          </div>
        </article>;
      })}
    </section>) : <p className={styles.empty}>Không có mặt hàng khớp “{search}”.</p>}

    <section className={styles.card} aria-label="Giao hàng">
      <h2>Giao tới</h2>
      <div className={styles.siteChoice} role="radiogroup" aria-label="Địa chỉ giao">
        {catalog.sites.map((entry) => <label key={entry.id}><input type="radio" name="site" checked={site === entry.id} onChange={() => setSite(entry.id)} />
          <span>{entry.name}<br /><small className={styles.hint}>{entry.address_text}</small></span></label>)}
        <label><input type="radio" name="site" checked={site === "new"} onChange={() => setSite("new")} /><span>Địa chỉ mới</span></label>
      </div>
      {site === "new" && <div className={styles.form}>
        <div className={styles.field}><label htmlFor="site-name">Tên công trình / nơi nhận</label><input id="site-name" value={newSite.name} maxLength={160}
          onChange={(event) => setNewSite({ ...newSite, name: event.target.value })} /></div>
        <div className={styles.field}><label htmlFor="site-address">Địa chỉ</label><textarea id="site-address" value={newSite.address} maxLength={300}
          onChange={(event) => setNewSite({ ...newSite, address: event.target.value })} /></div>
        <div className={styles.field}><label htmlFor="site-receiver">Người nhận</label><input id="site-receiver" value={newSite.receiverName} maxLength={120}
          onChange={(event) => setNewSite({ ...newSite, receiverName: event.target.value })} /></div>
        <div className={styles.field}><label htmlFor="site-phone">Số điện thoại người nhận</label><input id="site-phone" type="tel" inputMode="tel" value={newSite.receiverPhone} maxLength={60}
          onChange={(event) => setNewSite({ ...newSite, receiverPhone: event.target.value })} /></div>
      </div>}
      <div className={styles.field}><label htmlFor="order-when">Muốn nhận lúc (để trống = sớm nhất)</label>
        <input id="order-when" type="datetime-local" value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} /></div>
      <div className={styles.field}><label htmlFor="order-note">Ghi chú cho cửa hàng</label>
        <textarea id="order-note" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: giao buổi sáng, xe nhỏ vào được" /></div>
    </section>

    {message && <p className={styles.status} role="status">{message}</p>}
    <div className={styles.orderBar}>
      <span>{picked.length} mặt hàng · <strong>{money(total.toString())}</strong></span>
      <button className={styles.button} type="button" disabled={!picked.length || invalid || !siteReady} onClick={() => setReviewing(true)}>Xem lại đơn</button>
    </div>
    {invalid && <p className={styles.hint}>Số lượng chỉ gồm chữ số, tối đa 6 chữ số thập phân (ví dụ 2,5).</p>}
    {!siteReady && picked.length > 0 && <p className={styles.hint}>Nhập tên và địa chỉ giao mới.</p>}
  </div>;
}
