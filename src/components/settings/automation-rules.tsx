"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { deleteAutomationRuleAction, saveAutomationRuleAction, setBuiltinPushAction, testAutomationRuleAction, type AutomationActionResult }
  from "@/modules/settings/automation-actions";
import { CATALOGUE_GROUPS, automationChannelLabel, catalogueRows, conditionText, filterRows, minuteToTime, outboundStateText, reachText,
  recipientSummary, ruleReach, type AutomationOverview, type AutomationRule, type BuiltinKey, type CatalogueFilter, type CatalogueRow } from "@/modules/settings/automation-presentation";
import { QuietHoursForm } from "./automation-quiet-hours";
import { RuleWizard, draftOfRule, newDraft, type RuleDraft } from "./automation-rule-wizard";
import styles from "./notification-rules.module.css";

type Tab = "list" | "quiet" | "history";
const FILTERS: { value: CatalogueFilter; label: string }[] = [
  { value: "all", label: "Tất cả" }, { value: "phone", label: "Báo về điện thoại" }, { value: "app", label: "Chỉ trong app" }, { value: "mine", label: "Do anh/chị đặt" },
];
const money = (value: string) => formatVnd(vnd(value));

/** F5 + D93 "Quy tắc tự động": every notification the system sends — when, who receives it, through what — in one place. */
export function AutomationRules({ overview }: { overview: AutomationOverview }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("list");
  const [filter, setFilter] = useState<CatalogueFilter>("all");
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(key: string, work: () => Promise<AutomationActionResult>) {
    setBusy(key);
    try {
      const result = await work();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
      return result;
    } catch {
      const result = { ok: false, message: "Chưa rõ kết quả (mất kết nối). Tải lại trang để kiểm tra." };
      setMessage({ ok: false, text: result.message });
      return result;
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return <RuleWizard initial={editing} overview={overview} onClose={(saved) => { setEditing(null); if (saved) { setMessage({ ok: true, text: saved }); router.refresh(); } }} />;
  }

  const rows = catalogueRows(overview);
  const shown = filterRows(rows, filter);
  const counts = Object.fromEntries(FILTERS.map((item) => [item.value, filterRows(rows, item.value).length])) as Record<CatalogueFilter, number>;
  const staffOn = overview.people.filter((person) => person.devices > 0);
  const quiet = overview.quiet_hours;
  const ready = overview.setup.pg_net && overview.setup.pg_cron && overview.setup.app_delivery;

  const toggleRule = (rule: AutomationRule) => run(`rule:${rule.id}`, () => saveAutomationRuleAction({ ...toInput(draftOfRule(rule)), active: !rule.active, operationId: crypto.randomUUID() }));
  const addPhone = (row: Extract<CatalogueRow, { type: "app" }>) => run(`app:${row.item.value}`, () => saveAutomationRuleAction({ ...toInput(newDraft(row.item.value)),
    name: `${row.item.label} → báo điện thoại`, operationId: crypto.randomUUID() })).then((result) => {
    if (result.ok) setMessage({ ok: true, text: `Đã bật báo về điện thoại cho “${row.item.label}”. Bấm “Sửa” để chọn người nhận.` });
  });

  return <div className="page-stack">
    <section className={styles.summary} aria-label="Tình trạng gửi">
      <div className={styles.summaryCard}><span className={styles.summaryLabel}>Điện thoại nhân viên</span>
        <strong>{staffOn.length} người · {staffOn.reduce((sum, person) => sum + person.devices, 0)} máy</strong><small>đang bật thông báo</small></div>
      <div className={styles.summaryCard}><span className={styles.summaryLabel}>Khách hàng</span>
        <strong>{overview.customers?.people ?? 0} tài khoản · {overview.customers?.devices ?? 0} máy</strong><small>đang bật thông báo</small></div>
      <button type="button" className={styles.summaryCard} onClick={() => setTab("quiet")}><span className={styles.summaryLabel}>Giờ yên lặng</span>
        <strong>{quiet?.enabled ? `${minuteToTime(quiet.start_minute)} – ${minuteToTime(quiet.end_minute)}` : "Đang tắt"}</strong>
        <small>{quiet?.enabled ? "Tin dồn lại, gửi gộp khi hết giờ" : "Bấm để cài"}</small></button>
      <div className={styles.summaryCard}><span className={styles.summaryLabel}>Gửi nền</span>
        <strong className={ready ? styles.good : styles.warn}>{ready ? "Sẵn sàng" : "Cần kỹ thuật cài"}</strong>
        <small>{ready ? "Tự gửi lại khi lỗi" : "Thông báo trong app vẫn chạy"} · Webhook {overview.setup.webhook_secret ? "có chữ ký" : "chưa có chữ ký"}</small></div>
    </section>

    <div className={styles.toolbar}>
      <div className={styles.tabs} role="tablist" aria-label="Xem">
        {([["list", `Thông báo (${rows.length})`], ["quiet", "Giờ yên lặng"], ["history", "Lịch sử gửi"]] as [Tab, string][]).map(([value, label]) =>
          <button key={value} type="button" role="tab" id={`tab-${value}`} aria-selected={tab === value} aria-controls={`panel-${value}`} className={styles.tab}
            onClick={() => setTab(value)}>{label}</button>)}
      </div>
      {tab === "list" && <div className={styles.filters} role="group" aria-label="Lọc"><span>Lọc:</span>
        {FILTERS.map((item) => <button key={item.value} type="button" className={styles.chip} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
          {item.label}{item.value === "all" ? "" : ` (${counts[item.value]})`}</button>)}</div>}
      {tab === "list" && <button type="button" className="button button-primary" onClick={() => { setMessage(null); setEditing(newDraft()); }}>+ Thêm quy tắc</button>}
    </div>
    {message && <p className={`form-message${message.ok ? " success" : ""}`} role={message.ok ? "status" : "alert"}>{message.text}</p>}

    {tab === "list" && <div id="panel-list" role="tabpanel" aria-labelledby="tab-list" className="page-stack">
      {filter === "mine" && !shown.length && <section className={styles.group}><div className={styles.empty}>
        <strong>Chưa có quy tắc nào do anh/chị đặt</strong>
        <p>Thông báo có sẵn vẫn chạy. Thêm quy tắc khi muốn báo thêm việc khác hoặc gửi sang hệ thống khác.</p>
        <button type="button" className="button button-primary" onClick={() => setEditing(newDraft())}>+ Thêm quy tắc</button></div></section>}
      {CATALOGUE_GROUPS.map((group) => {
        const items = shown.filter((row) => row.group === group.value);
        if (!items.length) return null;
        return <section key={group.value} className={styles.group} aria-labelledby={`group-${group.value}`}>
          <div className={styles.groupHead}><h2 id={`group-${group.value}`}>{group.label}</h2><span>{items.length} thông báo</span></div>
          <div className={styles.rowHead} aria-hidden="true"><span>Thông báo · khi nào gửi</span><span>Ai nhận</span><span>Gửi qua</span><span className={styles.rowKind}>Loại</span><span>Bật / tắt</span></div>
          <ul className={styles.rows}>{items.map((row) => <Row key={row.key} row={row} overview={overview} busy={busy}
            onEdit={(rule) => { setMessage(null); setEditing(draftOfRule(rule)); }}
            onToggleRule={toggleRule} onAddPhone={addPhone}
            onToggleBuiltin={(key, enabled) => run(`builtin:${key}`, () => setBuiltinPushAction({ key: key as BuiltinKey, enabled }))}
            onTest={(rule) => confirm.ask({ title: "Gửi thử quy tắc?", confirmLabel: "Gửi thử",
              body: <p>Một tin thử của “{rule.name}” chỉ gửi tới {overview.my_devices} máy của anh/chị — không gửi cho người nhận thật, không gửi webhook.</p>,
              run: async () => { await run(`test:${rule.id}`, () => testAutomationRuleAction(rule.id)); } })}
            onDelete={(rule) => confirm.ask({ title: "Xóa quy tắc?", confirmLabel: "Xóa quy tắc", danger: true,
              body: <p>Quy tắc “{rule.name}” sẽ ngừng gửi và bị xóa khỏi danh sách. Lịch sử gửi vẫn giữ.</p>,
              run: async () => { await run(`delete:${rule.id}`, () => deleteAutomationRuleAction(rule.id)); } })} />)}</ul>
          {group.value === "worker" && <p className={styles.groupNote}>Tắt thông báo có sẵn chỉ dừng báo về điện thoại; thông báo trong app và popup trang chủ vẫn hiện.
            Có quy tắc “Việc mới” đang bật thì quy tắc gửi thay bản có sẵn (không báo hai lần).</p>}
          {group.value === "customer" && <p className={styles.groupNote}>Khách chỉ nhận tin của chính mình. Tin có số tiền chỉ tới Chủ tài khoản và Kế toán; Người nhận hàng nhận tin giao hàng, không thấy tiền.</p>}
          {group.value === "updates" && <p className={styles.groupNote}>Tin cập nhật do anh/chị tự soạn ở <Link href="/admin/notifications/updates">Soạn thông báo cập nhật</Link>; người nhận chọn lúc soạn.</p>}
        </section>;
      })}
    </div>}

    {tab === "quiet" && <div id="panel-quiet" role="tabpanel" aria-labelledby="tab-quiet"><QuietHoursForm value={quiet} onSaved={(text) => { setMessage({ ok: true, text }); router.refresh(); }} /></div>}

    {tab === "history" && <section id="panel-history" role="tabpanel" aria-labelledby="tab-history" className="card list-main">
      <div className="section-head"><h2>Lịch sử gửi</h2><span className="scope-chip">30 lần gần nhất</span></div>
      {overview.jobs.length ? <div className="table-wrap"><table className="card-table">
        <thead><tr><th scope="col">Lúc</th><th scope="col">Nội dung</th><th scope="col">Kênh</th><th scope="col">Trạng thái</th></tr></thead>
        <tbody>{overview.jobs.map((job) => <tr key={job.id}>
          <td data-label="Lúc">{formatBusinessDateTime(job.created_at)}</td>
          <td data-label="Nội dung">{job.title ?? "—"}{job.rule_name && <small className="table-subline">{job.rule_name}</small>}</td>
          <td data-label="Kênh">{automationChannelLabel(job.channel)}</td>
          <td data-label="Trạng thái">{outboundStateText(job.state)}{job.attempt > 1 && ` · lần ${job.attempt}`}{job.last_error && <small className="table-subline">{job.last_error.replace(/\s*\([A-Za-z_, ]+\)/g, "")}</small>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa gửi lần nào.</p>}
      <details className="settings-tech"><summary>Dành cho kỹ thuật</summary>
        <p className="muted">Gửi nền dùng pg_net và pg_cron trên Supabase. Khóa ký webhook (hx_webhook_secret) và địa chỉ ứng dụng lưu trong Supabase Vault, không lưu trong bảng dữ liệu. Webhook gửi JSON {"{ data, signature }"}, chữ ký HMAC-SHA256 của data.</p>
      </details>
    </section>}
    {confirm.dialog}
  </div>;
}

export function toInput(draft: RuleDraft) {
  return { ruleId: draft.id, expectedVersion: draft.version, operationId: crypto.randomUUID(), name: draft.name, event: draft.event, minAmountVnd: draft.minAmountVnd,
    problemsOnly: draft.problemsOnly, channels: draft.channels, target: draft.target, recipientMode: draft.recipientMode, roleIds: draft.roleIds,
    employeeIds: draft.employeeIds, active: draft.active };
}

function Row({ row, overview, busy, onEdit, onToggleRule, onAddPhone, onToggleBuiltin, onTest, onDelete }: {
  row: CatalogueRow; overview: AutomationOverview; busy: string | null;
  onEdit: (rule: AutomationRule) => void; onToggleRule: (rule: AutomationRule) => void; onAddPhone: (row: Extract<CatalogueRow, { type: "app" }>) => void;
  onToggleBuiltin: (key: string, enabled: boolean) => void; onTest: (rule: AutomationRule) => void; onDelete: (rule: AutomationRule) => void;
}) {
  if (row.type === "rule") {
    const { rule, item } = row;
    const reach = ruleReach(overview.people, item?.permission ?? null, rule.recipient_mode, rule.role_ids, rule.employee_ids);
    const kind = <span className={`${styles.pill} ${styles.pillRule}`}>Quy tắc</span>;
    return <li className={`${styles.row}${rule.active ? "" : ` ${styles.muted}`}`}>
      <span className={styles.rowTitle}><strong>{rule.name}</strong>
        <small>{item?.detail ?? "Sự kiện khác"}{rule.min_amount_vnd || rule.problems_only ? ` · ${conditionText(rule, money)}` : ""}{rule.active ? "" : " · Đang tắt"}</small></span>
      <span className={styles.rowWho}>{recipientSummary(rule, overview, item?.who ?? "Người có quyền")}
        {rule.channels.includes("PUSH") && <small>{reachText(reach)}</small>}</span>
      <span className={styles.rowChannels}>{rule.channels.includes("PUSH") && <span className={`${styles.pill} ${styles.pillPhone}`}>Điện thoại</span>}
        {rule.channels.includes("WEBHOOK") && <span className={styles.pill} title={rule.target ?? undefined}>Webhook</span>}
        <span className={`${styles.pill} ${styles.pillRule} ${styles.kindInline}`}>Quy tắc</span></span>
      <span className={styles.rowKind}>{kind}</span>
      <span className={styles.rowAction}>
        <button type="button" className={styles.linkButton} aria-label={`Sửa quy tắc ${rule.name}`} onClick={() => onEdit(rule)}>Sửa</button>
        <button type="button" className={styles.linkButton} aria-label={`Gửi thử quy tắc ${rule.name}`} disabled={busy !== null} onClick={() => onTest(rule)}>
          {busy === `test:${rule.id}` ? "Đang gửi…" : "Gửi thử"}</button>
        <button type="button" className={`${styles.linkButton} ${styles.linkDanger}`} aria-label={`Xóa quy tắc ${rule.name}`} disabled={busy !== null} onClick={() => onDelete(rule)}>Xóa</button>
        <button type="button" role="switch" aria-checked={rule.active} aria-label={`Bật quy tắc ${rule.name}`} className={styles.switch} disabled={busy !== null}
          onClick={() => onToggleRule(rule)} />
      </span>
    </li>;
  }
  if (row.type === "app") {
    const reach = ruleReach(overview.people, row.item.permission, "PERMISSION", [], []);
    return <li className={styles.row}>
      <span className={styles.rowTitle}><strong>{row.item.label}</strong><small>{row.item.detail}</small></span>
      <span className={styles.rowWho}>{row.item.who}<small>Chỉ thấy khi mở chuông · {reach.allowed} người</small></span>
      <span className={styles.rowChannels}><span className={styles.pill}>Chuông trong app</span><span className={`${styles.pill} ${styles.kindInline}`}>Chỉ trong app</span></span>
      <span className={styles.rowKind}><span className={styles.pill}>Chỉ trong app</span></span>
      <span className={styles.rowAction}><button type="button" className={styles.linkButton} disabled={busy !== null} aria-label={`Báo về điện thoại: ${row.item.label}`}
        onClick={() => onAddPhone(row)}>{busy === `app:${row.item.value}` ? "Đang bật…" : "+ Báo về điện thoại"}</button></span>
    </li>;
  }
  const { item, enabled, overridden } = row;
  const reach = item.audience === "customer" ? null : item.permission ? ruleReach(overview.people, item.permission, "PERMISSION", [], []) : null;
  return <li className={`${styles.row}${enabled ? "" : ` ${styles.muted}`}`}>
    <span className={styles.rowTitle}><strong>{item.label}</strong><small>{item.detail}{enabled ? "" : " · Đã tắt báo về điện thoại"}</small></span>
    <span className={styles.rowWho}>{item.who}
      <small>{item.audience === "customer" ? `${overview.customers?.people ?? 0} tài khoản · ${overview.customers?.devices ?? 0} máy đang bật`
        : reach ? reachText(reach) : "Xem một lần ở trang chủ"}</small></span>
    <span className={styles.rowChannels}><span className={`${styles.pill} ${styles.pillPhone}`}>Điện thoại</span>
      {"popup" in item && item.popup ? <span className={`${styles.pill} ${styles.pillPopup}`}>Popup trang chủ</span> : <span className={styles.pill}>Chuông trong app</span>}
      <span className={`${styles.pill} ${styles.pillBuiltin} ${styles.kindInline}`}>Có sẵn</span></span>
    <span className={styles.rowKind}><span className={`${styles.pill} ${styles.pillBuiltin}`}>Có sẵn</span></span>
    <span className={styles.rowAction}>{overridden && <small title={`Quy tắc “${overridden.name}” đang gửi thay bản có sẵn`}>Quy tắc đang gửi thay</small>}
      <button type="button" role="switch" aria-checked={enabled} aria-label={`Báo về điện thoại: ${item.label}`} className={styles.switch} disabled={busy !== null}
        onClick={() => onToggleBuiltin(item.value, !enabled)} /></span>
  </li>;
}
