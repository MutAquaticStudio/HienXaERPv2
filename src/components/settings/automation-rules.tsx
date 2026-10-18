"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { MoneyInput } from "@/components/ui/money-input";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { deleteAutomationRuleAction, saveAutomationRuleAction, testAutomationRuleAction } from "@/modules/settings/automation-actions";
import { AUTOMATION_CHANNELS, AUTOMATION_EVENTS, automationChannelLabel, automationEventLabel, outboundStateLabel,
  type AutomationChannel, type AutomationOverview, type AutomationRule } from "@/modules/settings/automation-presentation";

type Draft = { id: string | null; version: number | null; name: string; event: string; minAmountVnd: string; problemsOnly: boolean; channel: AutomationChannel; target: string; active: boolean };
const emptyDraft: Draft = { id: null, version: null, name: "", event: AUTOMATION_EVENTS[0].value, minAmountVnd: "", problemsOnly: false, channel: "PUSH", target: "", active: true };
const draftOf = (rule: AutomationRule): Draft => ({ id: rule.id, version: rule.version, name: rule.name, event: rule.event, minAmountVnd: rule.min_amount_vnd ?? "",
  problemsOnly: rule.problems_only, channel: rule.channel, target: rule.target ?? "", active: rule.active });

/** F5 "Quy tắc tự động": Khi [sự kiện] · Nếu [điều kiện] · Thì [gửi qua kênh]. Rules are stored as data and checked in the database. */
export function AutomationRules({ overview }: { overview: AutomationOverview }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(key: string, work: () => Promise<{ ok: boolean; message: string }>, after?: () => void) {
    setBusy(key);
    try {
      const result = await work();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) { after?.(); router.refresh(); }
    } catch {
      setMessage({ ok: false, text: "Chưa rõ kết quả (mất kết nối). Tải lại trang để kiểm tra." });
    } finally {
      setBusy(null);
    }
  }

  const save = (draft: Draft) => run("save", () => saveAutomationRuleAction({ ruleId: draft.id, expectedVersion: draft.version, operationId, name: draft.name,
    event: draft.event, minAmountVnd: draft.minAmountVnd, problemsOnly: draft.problemsOnly, channel: draft.channel, target: draft.target, active: draft.active }),
  () => { setEditing(null); setOperationId(crypto.randomUUID()); });

  const setup = overview.setup;
  return <div className="page-stack">
    <section className="card card-pad automation-setup" aria-label="Tình trạng cấu hình">
      <h2>Kênh gửi</h2>
      <ul className="automation-checks">
        <li className={setup.pg_net && setup.pg_cron ? "ok" : "warn"}>Gửi nền và gửi lại khi lỗi (pg_net, pg_cron): {setup.pg_net && setup.pg_cron ? "đã bật" : "chưa bật — thông báo trong ứng dụng vẫn chạy"}</li>
        <li className={setup.app_delivery ? "ok" : "warn"}>Thông báo về điện thoại và email: {setup.app_delivery ? "đã cấu hình" : "chưa cấu hình khóa gửi qua ứng dụng"} · {overview.push_devices} máy đã bật nhận</li>
        <li className={setup.telegram ? "ok" : "warn"}>Telegram: {setup.telegram ? "đã có bot" : "chưa có mã bot"}</li>
        <li className={setup.webhook_secret ? "ok" : "warn"}>Webhook: {setup.webhook_secret ? "có chữ ký bảo mật" : "chưa có khóa ký (vẫn gửi được, không ký)"}</li>
      </ul>
      <p className="muted">Không tốn phí dịch vụ ngoài: chạy trên Supabase và ứng dụng đang dùng. Mã bot Telegram, khóa ký và địa chỉ ứng dụng lưu trong Supabase Vault, không lưu trong bảng dữ liệu.</p>
    </section>

    <section className="card list-main">
      <div className="section-head"><h2>Quy tắc ({overview.rules.length})</h2>
        <button type="button" className="button button-primary" onClick={() => { setMessage(null); setEditing({ ...emptyDraft }); }}>+ Thêm quy tắc</button></div>
      {message && <p className={`form-message${message.ok ? "" : " warning"}`} role="status">{message.text}</p>}
      {overview.rules.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Quy tắc</th><th scope="col">Khi</th><th scope="col">Nếu</th><th scope="col">Thì gửi</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{overview.rules.map((rule) => <tr key={rule.id} className={rule.active ? undefined : "row-muted"}>
          <td data-label="Quy tắc"><strong>{rule.name}</strong>{!rule.active && <small className="table-subline">Đang tắt</small>}</td>
          <td data-label="Khi">{automationEventLabel(rule.event)}</td>
          <td data-label="Nếu">{rule.min_amount_vnd ? `Tổng tiền từ ${formatVnd(vnd(rule.min_amount_vnd))}` : rule.problems_only ? "Chỉ giao thiếu / không giao được" : "Mọi lần"}</td>
          <td data-label="Thì gửi">{automationChannelLabel(rule.channel)}{rule.target && <small className="table-subline">{rule.target}</small>}</td>
          <td className="table-actions">
            <button type="button" className="link-button" onClick={() => { setMessage(null); setEditing(draftOf(rule)); }}>Sửa</button>
            <button type="button" className="link-button" disabled={busy !== null} onClick={() => { void run(`test:${rule.id}`, () => testAutomationRuleAction(rule.id)); }}>{busy === `test:${rule.id}` ? "Đang gửi..." : "Gửi thử"}</button>
            <button type="button" className="link-button text-danger" disabled={busy !== null} onClick={() => { if (window.confirm(`Xóa quy tắc “${rule.name}”?`)) void run(`delete:${rule.id}`, () => deleteAutomationRuleAction(rule.id)); }}>Xóa</button>
          </td></tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có quy tắc. Bấm “+ Thêm quy tắc”.</p>}
    </section>

    <section className="card list-main">
      <div className="section-head"><h2>Lịch sử gửi</h2><span className="scope-chip">30 lần gần nhất</span></div>
      {overview.jobs.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Lúc</th><th scope="col">Nội dung</th><th scope="col">Kênh</th><th scope="col">Trạng thái</th></tr></thead>
        <tbody>{overview.jobs.map((job) => <tr key={job.id}>
          <td data-label="Lúc">{formatBusinessDateTime(job.created_at)}</td>
          <td data-label="Nội dung">{job.title ?? "—"}{job.rule_name && <small className="table-subline">{job.rule_name}</small>}</td>
          <td data-label="Kênh">{automationChannelLabel(job.channel)}</td>
          <td data-label="Trạng thái">{outboundStateLabel[job.state] ?? "Đang cập nhật"}{job.attempt > 1 && ` · lần ${job.attempt}`}{job.last_error && <small className="table-subline">{job.last_error}</small>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa gửi lần nào.</p>}
    </section>

    {editing && <RuleDialog draft={editing} busy={busy === "save"} message={message && !message.ok ? message.text : null} onClose={() => setEditing(null)} onSave={(draft) => { void save(draft); }} />}
  </div>;
}

function RuleDialog({ draft: initial, busy, message, onClose, onSave }: { draft: Draft; busy: boolean; message: string | null; onClose: () => void; onSave: (draft: Draft) => void }) {
  const [draft, setDraft] = useState(initial);
  const event = AUTOMATION_EVENTS.find((item) => item.value === draft.event);
  const channel = AUTOMATION_CHANNELS.find((item) => item.value === draft.channel)!;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  return <Dialog title={initial.id ? "Sửa quy tắc" : "Thêm quy tắc"} description="Khi có sự kiện · nếu đúng điều kiện · thì gửi qua kênh đã chọn." onClose={onClose} initialFocusId="rule-name">
    <form className="form-stack" onSubmit={(formEvent) => { formEvent.preventDefault(); onSave(draft); }}>
      <div className="field"><label htmlFor="rule-name">Tên quy tắc</label><input id="rule-name" value={draft.name} minLength={3} maxLength={120} required onChange={(input) => set({ name: input.target.value })} /></div>
      <div className="field"><label htmlFor="rule-event">Khi</label>
        <select id="rule-event" value={draft.event} onChange={(input) => set({ event: input.target.value, minAmountVnd: "", problemsOnly: false })}>
          {AUTOMATION_EVENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      {event && "amount" in event && <div className="field"><label htmlFor="rule-amount">Nếu tổng tiền từ (để trống = mọi đơn)</label>
        <MoneyInput id="rule-amount" value={draft.minAmountVnd} maxDigits={16} onValue={(value) => set({ minAmountVnd: value })} /></div>}
      {event && "problems" in event && <label className="check-row"><input type="checkbox" checked={draft.problemsOnly} onChange={(input) => set({ problemsOnly: input.target.checked })} /> Chỉ khi giao thiếu hoặc không giao được</label>}
      <div className="field"><label htmlFor="rule-channel">Thì gửi qua</label>
        <select id="rule-channel" value={draft.channel} onChange={(input) => set({ channel: input.target.value as AutomationChannel })}>
          {AUTOMATION_CHANNELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      {channel.target ? <div className="field"><label htmlFor="rule-target">Nơi nhận</label>
        <input id="rule-target" value={draft.target} required maxLength={300} placeholder={channel.target} autoComplete="off" onChange={(input) => set({ target: input.target.value })} />
        {draft.channel === "TELEGRAM" && <small className="muted">Thêm bot của cửa hàng vào nhóm Telegram, gửi một tin trong nhóm, rồi lấy mã nhóm (bắt đầu bằng -100).</small>}
        {draft.channel === "WEBHOOK" && <small className="muted">Dữ liệu gửi dạng JSON {"{ data, signature }"}; chữ ký HMAC-SHA256 của data bằng khóa hx_webhook_secret.</small>}</div>
        : <p className="muted">Gửi tới điện thoại của những người có quyền xem việc này và đã bật thông báo trên máy.</p>}
      <label className="check-row"><input type="checkbox" checked={draft.active} onChange={(input) => set({ active: input.target.checked })} /> Đang dùng</label>
      {message && <p className="form-message" role="alert">{message}</p>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Hủy</button>
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? "Đang lưu..." : "Lưu quy tắc"}</button></div>
    </form>
  </Dialog>;
}
