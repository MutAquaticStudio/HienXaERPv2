"use client";

import Decimal from "decimal.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Info, Minus, Plus, Search } from "lucide-react";

import styles from "@/components/portal/portal.module.css";
import { isExactEntryQuantity } from "@/lib/core/quantity";
import { formatPortalMoney as money } from "@/modules/portal/money";
import { submitServiceRequestAction } from "@/modules/portal/service-actions";
import {
  SERVICE_WINDOW_DAYS, SLOT_OPTIONS, addDays, businessToday, estimateVnd, filterServices, flatServices, quantityText, shortDate, slotText,
  type FlatService, type PortalServiceCatalog, type PortalServiceOption, type ServiceSlot,
} from "@/modules/portal/service-request";

const NEW_SITE = "new";
type Step = 1 | 2 | 3;
type DayChoice = "today" | "tomorrow" | "pick";
export type ServiceFormInitial = { serviceName?: string; optionId?: string; siteId?: string; quantity?: string };

/** "từ 170.000 đ", "2.500.000 đ" or "Cửa hàng báo giá" — the price line of a service in the list. */
function priceLine(service: FlatService) {
  const prices = service.options.flatMap((option) => (option.unit_price_vnd ? [BigInt(option.unit_price_vnd)] : []));
  if (!prices.length) return { text: "Cửa hàng báo giá", quote: true };
  const lowest = prices.reduce((low, price) => (price < low ? price : low));
  return { text: `${prices.length > 1 || service.options.length > 1 ? "từ " : ""}${money(lowest.toString())}`, quote: false };
}

/**
 * "Đặt dịch vụ" as in the approved concept (D75): 1 · choose a service (grouped, one entry per name, the unit chosen next),
 * 2 · details (site, quantity, the day and part of day the customer WISHES, contact, note), 3 · review and send. Nothing is
 * charged: the store confirms the schedule and the final amount follows the verified quantity. The estimate is only
 * the option's price × quantity, and "Cửa hàng báo giá" when the option has no price.
 */
export function PortalServiceForm({ catalog, operationId: initialOperationId, initial }: { catalog: PortalServiceCatalog; operationId: string; initial?: ServiceFormInitial }) {
  const router = useRouter();
  const topRef = useRef<HTMLDivElement>(null);
  const services = useMemo(() => flatServices(catalog), [catalog]);
  const initialService = initial?.serviceName ? services.find((entry) => entry.name === initial.serviceName) : undefined;
  const [step, setStep] = useState<Step>(initialService ? 2 : 1);
  const [query, setQuery] = useState("");
  const [serviceName, setServiceName] = useState(initialService?.name ?? "");
  const [optionId, setOptionId] = useState(initialService ? (initial?.optionId && initialService.options.some((entry) => entry.id === initial.optionId) ? initial.optionId : initialService.options[0]?.id ?? "") : "");
  const [site, setSite] = useState(initial?.siteId && catalog.sites.some((entry) => entry.id === initial.siteId) ? initial.siteId : catalog.sites[0]?.id ?? NEW_SITE);
  const [newSite, setNewSite] = useState({ name: "", address: "" });
  const [quantity, setQuantity] = useState(initial?.quantity && isExactEntryQuantity(initial.quantity) ? initial.quantity : "1");
  const today = businessToday();
  const [dayChoice, setDayChoice] = useState<DayChoice>("tomorrow");
  const [pickedDay, setPickedDay] = useState(addDays(today, 2));
  const [slot, setSlot] = useState<ServiceSlot>("MORNING");
  const [time, setTime] = useState("08:00");
  const [contactName, setContactName] = useState(catalog.contact.name ?? "");
  const [contactPhone, setContactPhone] = useState(catalog.contact.phone ?? "");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [operationId, setOperationId] = useState(initialOperationId);

  const service = services.find((entry) => entry.name === serviceName);
  const option: PortalServiceOption | undefined = service?.options.find((entry) => entry.id === optionId);
  const date = dayChoice === "today" ? today : dayChoice === "tomorrow" ? addDays(today, 1) : pickedDay;
  const chosenSite = catalog.sites.find((entry) => entry.id === site);
  const estimate = option ? estimateVnd(quantity, option.unit_price_vnd) : null;

  const digits = contactPhone.replace(/\D/g, "").length;
  const errors = {
    quantity: !isExactEntryQuantity(quantity) ? "Nhập số lượng lớn hơn 0 (tối đa 6 chữ số thập phân)." : null,
    siteName: site === NEW_SITE && newSite.name.trim().length < 2 ? "Nhập tên công trình (ít nhất 2 ký tự)." : null,
    siteAddress: site === NEW_SITE && newSite.address.trim().length < 5 ? "Nhập địa chỉ công trình (ít nhất 5 ký tự)." : null,
    date: date < today || date > addDays(today, SERVICE_WINDOW_DAYS) ? `Chọn ngày từ hôm nay đến ${SERVICE_WINDOW_DAYS} ngày tới.` : null,
    time: slot === "TIME" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? "Nhập giờ mong muốn." : null,
    contactName: contactName.trim().length < 2 ? "Nhập họ tên người liên hệ." : null,
    contactPhone: !/^[0-9+().\s-]+$/.test(contactPhone.trim()) || digits < 8 || digits > 15 ? "Nhập số điện thoại người liên hệ (8–15 chữ số)." : null,
  };
  const firstError = Object.values(errors).find(Boolean);
  const show = (key: keyof typeof errors) => (showErrors ? errors[key] : null);

  function go(next: Step) {
    setStep(next);
    setMessage(null);
    window.scrollTo({ top: 0 });
    // The new step's heading takes the focus, so a screen reader starts reading it.
    requestAnimationFrame(() => topRef.current?.focus());
  }

  function choose(entry: FlatService) {
    setServiceName(entry.name);
    // One option is chosen for the customer; with several, the one before stays when it exists, else the first.
    setOptionId(entry.options.some((item) => item.id === optionId) ? optionId : entry.options[0]?.id ?? "");
  }
  function stepQuantity(delta: number) {
    const now = isExactEntryQuantity(quantity) ? new Decimal(quantity) : new Decimal(0);
    const next = now.plus(delta);
    setQuantity(next.lte(0) ? "1" : next.toFixed());
  }
  function review() {
    setShowErrors(true);
    if (firstError) {
      setMessage("Còn thông tin chưa đúng. Kiểm tra các ô báo lỗi bên trên rồi bấm “Xem và gửi”.");
      return;
    }
    go(3);
  }

  async function send() {
    if (busy || !option || firstError) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await submitServiceRequestAction({
        customerId: catalog.customer.id, siteId: site === NEW_SITE ? null : site, newSite: site === NEW_SITE ? { name: newSite.name, address: newSite.address } : null,
        serviceTypeId: option.id, quantity, date, slot, time: slot === "TIME" ? time : null, contactName, contactPhone, note, operationId,
      });
      if (outcome.status === "SUCCESS") { router.push(`/customer/services/${outcome.resultId}?notice=submitted`); return; }
      // A rejected request can be corrected and sent as a new one; an unknown result is retried with the same operation.
      if (outcome.status === "FAILED") setOperationId(crypto.randomUUID());
      setMessage(outcome.message);
    } catch {
      setMessage("Chưa rõ yêu cầu đã gửi chưa (mất kết nối). Bấm “Gửi yêu cầu” lần nữa — hệ thống không tạo yêu cầu trùng.");
    } finally {
      setBusy(false);
    }
  }

  const header = <header className={styles.pageHead}>
    {step === 1
      ? <Link className={styles.backButton} href="/customer" aria-label="Quay lại"><ChevronLeft aria-hidden size={20} /></Link>
      : <button className={styles.backButton} type="button" aria-label="Quay lại" onClick={() => go((step - 1) as Step)}><ChevronLeft aria-hidden size={20} /></button>}
    <div><p>Giá theo bảng giá của bạn</p><h1>Đặt dịch vụ</h1></div>
  </header>;
  const stepTitles = ["Chọn dịch vụ", "Chi tiết yêu cầu", "Xem lại và gửi"];
  const progress = <div className={styles.svcProgress}>
    <div className={styles.svcBar} aria-hidden="true">{[1, 2, 3].map((n) => <span key={n} data-on={n <= step} />)}</div>
    <div ref={topRef} tabIndex={-1} className={styles.svcStepText}>Bước {step} / 3 · <strong>{stepTitles[step - 1]}</strong></div>
  </div>;

  if (!services.length) {
    return <div className={styles.svc}>
      {header}
      <section className={styles.card}>
        <h2>Chưa có dịch vụ nào mở cho bạn đặt</h2>
        <p className={styles.hint}>Cửa hàng chưa mở dịch vụ nào để đặt trên cổng. Nhắn tin hoặc gọi cửa hàng để được báo giá và xếp lịch.</p>
        <Link className={styles.buttonSecondary} href="/customer/messages">Nhắn tin cho cửa hàng</Link>
      </section>
    </div>;
  }

  // ---- Step 1: choose a service
  if (step === 1) {
    const groups = filterServices(catalog, query);
    return <div className={styles.svc}>
      {header}
      {progress}
      <label className={styles.shopSearch}><Search aria-hidden size={18} /><span className="sr-only">Tìm dịch vụ</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm: chạc, máy xúc, vận chuyển…" /></label>
      {groups.length === 0 && <p className={styles.empty}>Không có dịch vụ nào khớp “{query.trim()}”. Thử tên khác hoặc xóa ô tìm.</p>}
      {groups.map((group, index) => <section key={group.name} className={styles.svcGroup} aria-labelledby={`svc-group-${index}`}>
        <h2 id={`svc-group-${index}`}>{group.name}</h2>
        <ul>{group.services.map((entry) => {
          const flat: FlatService = { group: group.name, name: entry.name, options: entry.options };
          const price = priceLine(flat);
          const selected = entry.name === serviceName;
          return <li key={entry.name}><button type="button" className={styles.svcItem} aria-pressed={selected} onClick={() => choose(flat)}>
            <span><strong>{entry.name}</strong><small>Theo {entry.options.map((item) => item.unit_label).join(" · ")}</small></span>
            <span className={price.quote ? `${styles.svcPrice} ${styles.svcQuote}` : styles.svcPrice}>{price.text}</span>
            {selected && <span className={styles.svcCheck} aria-hidden="true"><Check size={14} strokeWidth={3} /></span>}
          </button></li>;
        })}</ul>
      </section>)}
      <div className={styles.svcFooter}>
        <button type="button" className={styles.svcNext} disabled={!service} onClick={() => go(2)}>
          {service ? <>Tiếp tục · {service.name}<ChevronRight aria-hidden size={18} /></> : "Chọn một dịch vụ để tiếp tục"}
        </button>
      </div>
    </div>;
  }

  // ---- Step 3: review and send
  if (step === 3 && service && option) {
    const wishDay = date === today ? "Hôm nay" : date === addDays(today, 1) ? "Ngày mai" : "Ngày";
    return <div className={styles.svc}>
      {header}
      {progress}
      <section className={styles.card} aria-labelledby="svc-summary">
        <div className={styles.cardHead}><h2 id="svc-summary">Yêu cầu của bạn</h2>
          <button type="button" className={styles.linkTap} onClick={() => go(2)}>Sửa</button></div>
        <dl className={styles.svcSummary}>
          <div><dt>Dịch vụ</dt><dd>{service.name}</dd></div>
          <div><dt>Công trình</dt><dd>{site === NEW_SITE ? newSite.name.trim() : chosenSite?.name}<small>{site === NEW_SITE ? newSite.address.trim() : chosenSite?.address_text}</small></dd></div>
          <div><dt>Mong muốn</dt><dd>{wishDay} {shortDate(date)}<small>{slot === "TIME" ? `Lúc ${time}` : `Buổi ${SLOT_OPTIONS.find((item) => item.value === slot)?.label.toLocaleLowerCase("vi-VN")} ${SLOT_OPTIONS.find((item) => item.value === slot)?.hint}`}</small></dd></div>
          <div><dt>Khối lượng</dt><dd>{quantityText(quantity, option.unit_label)}</dd></div>
          <div><dt>Liên hệ</dt><dd>{contactName.trim()}<small>{contactPhone.trim()}</small></dd></div>
          {note.trim() && <div><dt>Ghi chú</dt><dd>{note.trim()}</dd></div>}
        </dl>
        <div className={styles.svcEstimate}>
          <span>Tạm tính{estimate !== null && option.unit_price_vnd && <small>{quantity} × {money(option.unit_price_vnd)}</small>}</span>
          <strong>{estimate !== null ? money(estimate.toString()) : "Cửa hàng báo giá"}</strong>
        </div>
      </section>
      <div className={styles.svcNote}><Info aria-hidden size={20} />
        <p>Cửa hàng sẽ xác nhận lịch và nhắn lại cho bạn. <strong>Bạn chưa bị tính tiền.</strong> Số tiền cuối tính theo khối lượng thực tế, sau khi thợ làm xong và hai bên xác nhận.</p></div>
      {message && <p className={styles.status} role="status">{message}</p>}
      <div className={styles.svcFooter}>
        <button id="portal-service-send" type="button" className={styles.svcNext} disabled={busy} onClick={() => { void send(); }}>{busy ? "Đang gửi..." : "Gửi yêu cầu"}</button>
        <button type="button" className={styles.svcBack} disabled={busy} onClick={() => go(2)}>Quay lại sửa</button>
      </div>
    </div>;
  }

  // ---- Step 2: details
  const unitWord = option?.unit_label ?? "";
  return <div className={styles.svc}>
    {header}
    {progress}
    <section className={styles.svcPicked} aria-label="Dịch vụ đã chọn">
      <span className={styles.svcPickedIcon} aria-hidden="true"><Check size={18} strokeWidth={3} /></span>
      <span><strong>{service?.name}</strong><small>Nhóm {service?.group}</small></span>
      <button type="button" className={styles.linkTap} onClick={() => go(1)}>Đổi</button>
    </section>

    <section className={styles.svcSection} aria-labelledby="svc-site">
      <h2 id="svc-site">Công trình</h2>
      {catalog.sites.length === 0 && <p className={styles.hint}>Bạn chưa có công trình nào. Nhập công trình mới bên dưới.</p>}
      <div role="radiogroup" aria-labelledby="svc-site" className={styles.svcRadios}>
        {catalog.sites.map((entry) => <label key={entry.id} className={styles.svcRadio}>
          <input type="radio" name="svc-site" checked={site === entry.id} onChange={() => setSite(entry.id)} />
          <span><strong>{entry.name}</strong><small>{entry.address_text}</small></span></label>)}
        <label className={styles.svcRadio}><input type="radio" name="svc-site" checked={site === NEW_SITE} onChange={() => setSite(NEW_SITE)} /><span><strong>+ Công trình mới</strong></span></label>
      </div>
      {site === NEW_SITE && <div className={styles.svcFields}>
        <div className={styles.field}><label htmlFor="svc-site-name">Tên công trình</label><input id="svc-site-name" value={newSite.name} maxLength={160} autoComplete="off"
          aria-invalid={Boolean(show("siteName"))} aria-describedby="svc-site-name-error" onChange={(event) => setNewSite({ ...newSite, name: event.target.value })} />
          <small id="svc-site-name-error" className={styles.error} role="alert">{show("siteName")}</small></div>
        <div className={styles.field}><label htmlFor="svc-site-address">Địa chỉ</label><textarea id="svc-site-address" rows={2} value={newSite.address} maxLength={300}
          aria-invalid={Boolean(show("siteAddress"))} aria-describedby="svc-site-address-error" onChange={(event) => setNewSite({ ...newSite, address: event.target.value })} />
          <small id="svc-site-address-error" className={styles.error} role="alert">{show("siteAddress")}</small></div>
      </div>}
    </section>

    <section className={styles.svcSection} aria-labelledby="svc-qty">
      <h2 id="svc-qty">Khối lượng</h2>
      {service && service.options.length > 1 && <div className={styles.svcOptions} role="group" aria-label="Tính theo">
        {service.options.map((item) => <button key={item.id} type="button" aria-pressed={item.id === optionId} onClick={() => setOptionId(item.id)}>
          <span>{item.unit_label.charAt(0).toLocaleUpperCase("vi-VN") + item.unit_label.slice(1)}</span>
          <small>{item.unit_price_vnd ? `${money(item.unit_price_vnd)} / ${item.unit_label}` : "Cửa hàng báo giá"}</small></button>)}
      </div>}
      <div className={styles.svcQtyRow}>
        <label htmlFor="svc-quantity">Số lượng ({unitWord})</label>
        <span className={styles.stepper}>
          <button type="button" aria-label={`Giảm một ${unitWord}`} onClick={() => stepQuantity(-1)}><Minus aria-hidden size={18} /></button>
          <input id="svc-quantity" inputMode="decimal" value={quantity} aria-invalid={Boolean(show("quantity"))} aria-describedby="svc-quantity-error" onChange={(event) => setQuantity(event.target.value.replace(",", "."))} />
          <button type="button" aria-label={`Tăng một ${unitWord}`} onClick={() => stepQuantity(1)}><Plus aria-hidden size={18} /></button>
        </span>
      </div>
      <small id="svc-quantity-error" className={styles.error} role="alert">{show("quantity")}</small>
    </section>

    <section className={styles.svcSection} aria-labelledby="svc-time">
      <h2 id="svc-time">Thời gian mong muốn</h2>
      <div className={styles.chipGrid} role="group" aria-label="Ngày">
        <button type="button" aria-pressed={dayChoice === "today"} onClick={() => setDayChoice("today")}><span>Hôm nay</span><small>{shortDate(today)}</small></button>
        <button type="button" aria-pressed={dayChoice === "tomorrow"} onClick={() => setDayChoice("tomorrow")}><span>Ngày mai</span><small>{shortDate(addDays(today, 1))}</small></button>
        <button type="button" aria-pressed={dayChoice === "pick"} onClick={() => setDayChoice("pick")}><span>Chọn ngày</span><small>{dayChoice === "pick" ? shortDate(pickedDay) : "…"}</small></button>
      </div>
      {dayChoice === "pick" && <div className={styles.field}><label htmlFor="svc-date">Ngày mong muốn</label>
        <input id="svc-date" type="date" min={today} max={addDays(today, SERVICE_WINDOW_DAYS)} value={pickedDay} onChange={(event) => setPickedDay(event.target.value)} aria-invalid={Boolean(show("date"))} aria-describedby="svc-date-error" /></div>}
      <div className={styles.chipGrid} role="group" aria-label="Buổi">
        {SLOT_OPTIONS.map((item) => <button key={item.value} type="button" aria-pressed={slot === item.value} onClick={() => setSlot(item.value)}>
          <span>{item.label}</span><small>{item.value === "TIME" ? (slot === "TIME" ? time : "…") : item.hint}</small></button>)}
      </div>
      {slot === "TIME" && <div className={styles.field}><label htmlFor="svc-clock">Giờ mong muốn</label>
        <input id="svc-clock" type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-invalid={Boolean(show("time"))} aria-describedby="svc-date-error" /></div>}
      <small id="svc-date-error" className={styles.error} role="alert">{show("date") ?? show("time")}</small>
      <small className={styles.hint}>Cửa hàng sẽ xác nhận lại giờ chính xác cho bạn ({slotText(slot, slot === "TIME" ? time : null)}).</small>
    </section>

    <section className={styles.svcSection} aria-labelledby="svc-contact">
      <h2 id="svc-contact">Người liên hệ tại công trình</h2>
      <div className={styles.svcContact}>
        <div className={styles.field}><label htmlFor="svc-contact-name">Họ tên</label><input id="svc-contact-name" value={contactName} maxLength={120} autoComplete="name"
          aria-invalid={Boolean(show("contactName"))} aria-describedby="svc-contact-name-error" onChange={(event) => setContactName(event.target.value)} />
          <small id="svc-contact-name-error" className={styles.error} role="alert">{show("contactName")}</small></div>
        <div className={styles.field}><label htmlFor="svc-contact-phone">Số điện thoại</label><input id="svc-contact-phone" type="tel" inputMode="tel" value={contactPhone} maxLength={30} autoComplete="tel"
          aria-invalid={Boolean(show("contactPhone"))} aria-describedby="svc-contact-phone-error" onChange={(event) => setContactPhone(event.target.value)} />
          <small id="svc-contact-phone-error" className={styles.error} role="alert">{show("contactPhone")}</small></div>
      </div>
    </section>

    <section className={styles.svcSection} aria-labelledby="svc-note">
      <h2 id="svc-note">Ghi chú cho cửa hàng <span>(không bắt buộc)</span></h2>
      <div className={styles.field}><label htmlFor="svc-note-text" className="sr-only">Ghi chú</label>
        <textarea id="svc-note-text" rows={3} value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)}
          placeholder="Ví dụ: hẻm nhỏ, xe lớn không vào được; gạch vỡ đã gom sẵn ở cổng." /></div>
    </section>

    {message && <p className={styles.status} role="status">{message}</p>}
    <div className={styles.svcFooter}>
      <button type="button" className={styles.svcNext} onClick={review}>
        <span className={styles.svcNextInfo}><small>{estimate !== null ? `Tạm tính · ${quantityText(quantity, unitWord)}` : `${quantityText(isExactEntryQuantity(quantity) ? quantity : "0", unitWord)}`}</small>
          <strong>{estimate !== null ? money(estimate.toString()) : "Cửa hàng báo giá"}</strong></span>
        <span className={styles.svcNextGo}>Xem và gửi<ChevronRight aria-hidden size={18} /></span>
      </button>
    </div>
  </div>;
}
