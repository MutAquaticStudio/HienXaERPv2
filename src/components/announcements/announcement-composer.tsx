"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/announcements/announcements.module.css";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { createAnnouncementAction, stopAnnouncementAction } from "@/modules/announcements/actions";
import { chipOf, LABEL_NAMES, LINK_OPTIONS, type AnnouncementLabel, type AnnouncementSurface, type ComposerOptions,
  type SentAnnouncement } from "@/modules/announcements/presentation";

const AUDIENCES: { value: AnnouncementSurface; label: string; portal: string; unit: string }[] = [
  { value: "CUSTOMER", label: "Khách hàng", portal: "Cổng khách", unit: "tài khoản khách" },
  { value: "WORKER", label: "Thợ & tài xế", portal: "Cổng thợ", unit: "thợ & tài xế" },
  { value: "OFFICE", label: "Nhân viên văn phòng", portal: "Văn phòng", unit: "nhân viên" },
];
const LABELS: AnnouncementLabel[] = ["NEWS", "FEATURE", "RULE"];
const TITLE_MAX = 80;
const BODY_MAX = 600;

function sentTo(row: SentAnnouncement) {
  if (row.audience === "CUSTOMER") return row.kind === "PRICE" ? `Khách có giá thay đổi (${row.announcements})` : `Khách hàng (${row.recipients})`;
  if (row.audience === "WORKER") return `Thợ & tài xế (${row.recipients})`;
  return row.kind === "PRICE" ? `Nhân viên xem giá bán (${row.recipients})` : `Nhân viên văn phòng (${row.recipients})`;
}
function madeBy(row: SentAnnouncement) {
  return row.kind === "PRICE" ? "Tự động · lưu giá" : row.kind === "PAY_RATE" ? "Tự động · đơn giá công" : "Soạn tay";
}

/**
 * D83 "Soạn thông báo cập nhật" (owner only): news, new features or rules for customers, workers or office staff — a popup once
 * for each person at the next open, and a push to their devices. Prices are never written here: each customer's own prices are
 * announced automatically when a price list is saved, so nobody sees another group's prices.
 */
export function AnnouncementComposer({ options, sent, now }: {
  options: ComposerOptions; sent: SentAnnouncement[] | null;
  /** When the page was read (ms): which announcements have run out, today's date in the preview. */
  now: number;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [audience, setAudience] = useState<AnnouncementSurface>("CUSTOMER");
  const [label, setLabel] = useState<AnnouncementLabel>("NEWS");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [roleIds, setRoleIds] = useState<ReadonlySet<string>>(() => new Set());
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const chosen = AUDIENCES.find((item) => item.value === audience)!;
  const reach = audience === "CUSTOMER" ? options.customers : audience === "WORKER" ? options.workers
    : roleIds.size ? options.roles.filter((role) => roleIds.has(role.id)).reduce((sum, role) => sum + role.count, 0) : options.office;
  const counts: Record<AnnouncementSurface, number> = { CUSTOMER: options.customers, WORKER: options.workers, OFFICE: options.office };
  const linkName = LINK_OPTIONS[audience].find((option) => option.value === link)?.label;
  const chip = chipOf({ kind: "MANUAL", label });

  function changed() { setMessage(null); }
  function pickAudience(next: AnnouncementSurface) { setAudience(next); setLink(""); setRoleIds(new Set()); changed(); }
  function checkTitle() {
    const ok = title.trim().length >= 3;
    setTitleError(ok ? null : "Tiêu đề cần ít nhất 3 ký tự.");
    return ok;
  }

  async function send() {
    const result = await createAnnouncementAction({ operationId, audience, label, title, body, link, roleIds: [...roleIds] });
    setMessage({ ok: result.success, text: result.success ? `Đã gửi cho ${reach} ${chosen.unit}. Mỗi người thấy một lần ở lần mở app tiếp theo.` : result.message });
    if (result.success) {
      setTitle(""); setBody(""); setLink(""); setOperationId(crypto.randomUUID());
      router.refresh();
    }
  }

  return <div className="page-stack">
    <div className={styles.composer}>
      <form className="card card-pad form-stack" aria-label="Nội dung thông báo" noValidate onSubmit={(event) => {
        event.preventDefault();
        if (!checkTitle()) return;
        if (!reach) { setMessage({ ok: false, text: "Chưa có ai nhận thông báo này. Chọn nhóm người nhận khác." }); return; }
        confirm.ask({ title: `Gửi cho ${reach} ${chosen.unit}?`, confirmLabel: "Gửi ngay",
          body: <p>Mỗi người thấy thông báo một lần ở lần mở app tiếp theo, trên trang chủ, và nhận thông báo đẩy trên các máy đã bật thông báo.</p>,
          run: send });
      }}>
        <fieldset className={styles.audiences}>
          <legend>Gửi tới</legend>
          {AUDIENCES.map((item) => <label key={item.value} className={styles.audience} data-checked={audience === item.value || undefined}>
            <input type="radio" name="audience" value={item.value} checked={audience === item.value} onChange={() => pickAudience(item.value)} />
            <span><strong>{item.label}</strong><small>{item.portal} · {counts[item.value]} {item.value === "CUSTOMER" ? "tài khoản" : "người"}</small></span>
          </label>)}
        </fieldset>
        {audience === "CUSTOMER" && <p className="muted">Không ghi giá vào tin soạn tay. Giá của từng khách được báo tự động khi lưu bảng giá, để khách không thấy giá của nhóm khác.</p>}
        {audience === "OFFICE" && options.roles.length > 0 && <fieldset className="check-row">
          <legend className={styles.legend}>Vai trò nhận (không chọn: mọi nhân viên văn phòng)</legend>
          {options.roles.map((role) => <label key={role.id}><input type="checkbox" checked={roleIds.has(role.id)} onChange={(event) => {
            const next = new Set(roleIds);
            if (event.target.checked) next.add(role.id); else next.delete(role.id);
            setRoleIds(next); changed();
          }} />{role.name} ({role.count})</label>)}
        </fieldset>}
        <div className="form-grid">
          <div className="field"><label htmlFor="announcement-label">Nhãn</label>
            <select id="announcement-label" value={label} onChange={(event) => { setLabel(event.target.value as AnnouncementLabel); changed(); }}>
              {LABELS.map((value) => <option key={value} value={value}>{LABEL_NAMES[value]}</option>)}
            </select></div>
          <div className="field"><label htmlFor="announcement-link">Nút mở trang (không bắt buộc)</label>
            <select id="announcement-link" value={link} onChange={(event) => { setLink(event.target.value); changed(); }} aria-describedby="announcement-link-hint">
              <option value="">Không có nút</option>
              {LINK_OPTIONS[audience].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <small id="announcement-link-hint" className="muted">Chỉ mở trang trong app, không gắn link ngoài.</small></div>
        </div>
        <div className="field"><label htmlFor="announcement-title" className={styles.counted}><span>Tiêu đề</span><span className="muted">{title.length}/{TITLE_MAX}</span></label>
          <input id="announcement-title" value={title} maxLength={TITLE_MAX} required aria-invalid={titleError ? true : undefined} aria-describedby={titleError ? "announcement-title-error" : undefined}
            onBlur={() => { if (title) checkTitle(); }} onChange={(event) => { setTitle(event.target.value); if (titleError) setTitleError(null); changed(); }} />
          {titleError && <small id="announcement-title-error" className="field-error" role="alert">{titleError}</small>}</div>
        <div className="field"><label htmlFor="announcement-body" className={styles.counted}><span>Nội dung</span><span className="muted">{body.length}/{BODY_MAX}</span></label>
          <textarea id="announcement-body" rows={4} value={body} maxLength={BODY_MAX} onChange={(event) => { setBody(event.target.value); changed(); }} /></div>
        <div className="inline-actions">
          <button type="submit" className="button button-primary">Gửi thông báo</button>
          <span className="muted">{reach ? `Sẽ hiện cho ${reach} ${chosen.unit}` : "Chưa có ai nhận"}</span>
        </div>
        {message && <p className={`form-message${message.ok ? " success" : ""}`} role={message.ok ? "status" : "alert"}>{message.text}</p>}
      </form>

      <section className="card card-pad form-stack" aria-labelledby="announcement-preview">
        <h2 id="announcement-preview">Xem trước</h2>
        <p className="muted">{audience === "OFFICE" ? "Hộp thoại ở văn phòng (máy tính). Điện thoại: toàn màn hình." : "Tấm trượt từ dưới lên trên điện thoại. Máy tính: hộp giữa màn hình."}</p>
        <div className={styles.preview} aria-hidden="true">
          <div className={styles.top}><span className={styles.chip} data-tone={chip.tone}>{chip.text}</span><span className={styles.count}>1/1</span></div>
          <div className={styles.head}><h2>{title.trim() || "Tiêu đề thông báo"}</h2></div>
          <p className={styles.manualBody}>{body.trim() || "Nội dung thông báo hiện ở đây."}</p>
          <p className={styles.signOff}>Cửa hàng Hiền Xa · {formatBusinessDate(new Date(now).toISOString())}</p>
          {linkName && <span className={styles.previewSecondary}>{linkName}</span>}
          <span className={styles.previewPrimary}>Đã hiểu</span>
        </div>
      </section>
    </div>

    <section className="card list-main" aria-labelledby="announcements-sent">
      <div className="section-head"><h2 id="announcements-sent">Đã gửi gần đây</h2></div>
      {sent === null ? <p className="form-message" role="alert">Chưa tải được danh sách đã gửi. Tải lại trang.</p>
        : sent.length === 0 ? <p className="muted card-pad">Chưa có thông báo nào. Lưu bảng giá hoặc đổi đơn giá công cũng tự tạo thông báo ở đây.</p>
          : <div className="table-wrap"><table className="card-table">
            <thead><tr><th scope="col">Tiêu đề</th><th scope="col">Gửi tới</th><th scope="col">Cách tạo</th><th scope="col">Ngày</th><th scope="col">Đã xem</th>
              <th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
            <tbody>{sent.map((row) => {
              const expired = new Date(row.expires_at).getTime() <= now;
              return <tr key={row.group_id} className={row.withdrawn_at || expired ? "row-muted" : undefined}>
                <td data-label="Tiêu đề"><strong>{row.title}</strong></td>
                <td data-label="Gửi tới">{sentTo(row)}</td>
                <td data-label="Cách tạo">{madeBy(row)}</td>
                <td data-label="Ngày">{formatBusinessDateTime(row.created_at)}</td>
                <td data-label="Đã xem">{row.seen}/{row.recipients}</td>
                <td className="table-actions">{row.withdrawn_at ? <span className="muted">Đã ngừng</span> : expired ? <span className="muted">Hết hạn</span>
                  : <button type="button" className="link-button" aria-label={`Ngừng hiện ${row.title}`} onClick={() => confirm.ask({
                    title: "Ngừng hiện thông báo này?", confirmLabel: "Ngừng hiện", danger: true,
                    body: <p>“{row.title}” sẽ không hiện nữa với người chưa xem và biến khỏi mục Thông báo của họ. Thông báo đẩy đã gửi không thu hồi được.</p>,
                    run: async () => {
                      const result = await stopAnnouncementAction({ groupId: row.group_id, operationId: crypto.randomUUID() });
                      setMessage({ ok: result.success, text: result.message });
                      if (result.success) router.refresh();
                    } })}>Ngừng hiện</button>}</td>
              </tr>;
            })}</tbody>
          </table></div>}
    </section>
    {confirm.dialog}
  </div>;
}
