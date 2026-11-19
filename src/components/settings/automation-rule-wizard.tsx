"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoneyInput } from "@/components/ui/money-input";
import { formatVnd, vnd } from "@/lib/core/money";
import { saveAutomationRuleAction, sendTestPushAction } from "@/modules/settings/automation-actions";
import { AUTOMATION_CHANNELS, AUTOMATION_EVENTS, CATALOGUE_GROUPS, RECIPIENT_MODES, automationEventItem, ruleReach,
  type AutomationChannel, type AutomationOverview, type AutomationRule, type RecipientMode } from "@/modules/settings/automation-presentation";
import styles from "./notification-rules.module.css";

export type RuleDraft = { id: string | null; version: number | null; name: string; event: string; minAmountVnd: string; problemsOnly: boolean;
  channels: AutomationChannel[]; target: string; recipientMode: RecipientMode; roleIds: string[]; employeeIds: string[]; active: boolean };

export const newDraft = (event = ""): RuleDraft => ({ id: null, version: null, name: "", event, minAmountVnd: "", problemsOnly: false, channels: ["PUSH"], target: "",
  recipientMode: "PERMISSION", roleIds: [], employeeIds: [], active: true });
export const draftOfRule = (rule: AutomationRule): RuleDraft => ({ id: rule.id, version: rule.version, name: rule.name, event: rule.event,
  minAmountVnd: rule.min_amount_vnd ?? "", problemsOnly: rule.problems_only, channels: [...rule.channels], target: rule.target ?? "",
  recipientMode: rule.recipient_mode, roleIds: [...rule.role_ids], employeeIds: [...rule.employee_ids], active: rule.active });

const STEPS = ["Khi nào", "Điều kiện", "Gửi cho ai", "Gửi qua đâu", "Xem trước", "Lưu"] as const;
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** D93 rule editor: Khi nào → Điều kiện → Gửi cho ai → Gửi qua đâu → Xem trước (gửi thử cho tôi) → Lưu. */
export function RuleWizard({ initial, overview, onClose }: { initial: RuleDraft; overview: AutomationOverview; onClose: (saved?: string) => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState(initial.id ? 2 : 0);
  const [visited, setVisited] = useState(initial.id ? 5 : 0);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; conflict?: boolean } | null>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [tested, setTested] = useState(false);
  const set = (patch: Partial<RuleDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const item = automationEventItem(draft.event);
  const reach = ruleReach(overview.people, item?.permission ?? null, draft.recipientMode, draft.roleIds, draft.employeeIds);
  const permissionPeople = ruleReach(overview.people, item?.permission ?? null, "PERMISSION", [], []);

  const recipientText = draft.recipientMode === "ROLES" ? overview.roles.filter((role) => draft.roleIds.includes(role.id)).map((role) => role.name).join(", ") || "vai trò đã chọn"
    : draft.recipientMode === "PEOPLE" ? overview.people.filter((person) => draft.employeeIds.includes(person.id)).map((person) => person.name).join(", ") || "người đã chọn"
    : lower(item?.who ?? "người phụ trách");
  const channelText = draft.channels.map((channel) => channel === "PUSH" ? "điện thoại" : "webhook").join(" và ");
  const conditionText = draft.minAmountVnd ? `từ ${formatVnd(vnd(draft.minAmountVnd))}` : draft.problemsOnly ? "chỉ khi giao có vấn đề" : "mọi lần";
  const sentence = item ? `Khi ${lower(item.label)}${draft.minAmountVnd ? ` ${conditionText}` : draft.problemsOnly ? ` (${conditionText})` : ""} → báo ${recipientText} qua ${channelText || "…"}.` : "Chọn việc xảy ra để bắt đầu.";
  const summaries = [item?.label ?? "Chưa chọn", item ? conditionText.charAt(0).toUpperCase() + conditionText.slice(1) : "—",
    draft.recipientMode === "PERMISSION" ? "Theo quyền" : `${reach.chosen} người`, draft.channels.map((channel) => channel === "PUSH" ? "Điện thoại" : "Webhook").join(", ") || "Chưa chọn",
    tested ? "Đã gửi thử" : "Chưa gửi thử", draft.name.trim() || "Đặt tên, bật"];

  function problem(at: number): string | null {
    if (at === 0 && !item) return "Chọn một việc xảy ra.";
    if (at === 2 && draft.recipientMode === "ROLES" && !draft.roleIds.length) return "Chọn ít nhất một vai trò.";
    if (at === 2 && draft.recipientMode === "PEOPLE" && !draft.employeeIds.length) return "Chọn ít nhất một người.";
    if (at === 3 && !draft.channels.length) return "Chọn ít nhất một nơi gửi.";
    if (at === 3 && draft.channels.includes("WEBHOOK") && !/^https:\/\/\S{4,}$/.test(draft.target.trim())) return "Nhập địa chỉ webhook bắt đầu bằng https://";
    if (at === 5 && draft.name.trim().length < 3) return "Đặt tên quy tắc (từ 3 ký tự).";
    return null;
  }
  function go(next: number) {
    for (let at = 0; at < next; at += 1) {
      const issue = problem(at);
      if (issue) { setStep(at); setMessage({ ok: false, text: issue }); return; }
    }
    setMessage(null);
    if (next === 5 && !draft.name.trim() && item) set({ name: `${item.label} → báo ${draft.recipientMode === "PERMISSION" ? "người phụ trách" : recipientText}`.slice(0, 120) });
    setStep(next);
    setVisited((current) => Math.max(current, next));
  }

  async function save() {
    const issue = [0, 2, 3, 5].map(problem).find(Boolean);
    if (issue) { setMessage({ ok: false, text: issue }); return; }
    setBusy("save");
    try {
      const result = await saveAutomationRuleAction({ ruleId: draft.id, expectedVersion: draft.version, operationId, name: draft.name, event: draft.event,
        minAmountVnd: draft.minAmountVnd, problemsOnly: draft.problemsOnly, channels: draft.channels, target: draft.target, recipientMode: draft.recipientMode,
        roleIds: draft.roleIds, employeeIds: draft.employeeIds, active: draft.active });
      if (result.ok) { onClose(result.message); return; }
      setMessage({ ok: false, text: result.message, conflict: result.message.includes("người khác sửa") });
      if (!result.message.startsWith("Chưa rõ")) setOperationId(crypto.randomUUID());
    } catch {
      setMessage({ ok: false, text: "Chưa rõ quy tắc đã lưu chưa (mất kết nối). Tải lại trang để kiểm tra — bấm Lưu lại không tạo hai quy tắc trùng nhau." });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (!item) return;
    setBusy("test");
    try {
      const result = await sendTestPushAction({ title: item.sample.title, body: item.sample.body, operationId: crypto.randomUUID() });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) setTested(true);
    } catch {
      setMessage({ ok: false, text: "Chưa rõ đã gửi thử chưa (mất kết nối). Thử lại sau ít giây." });
    } finally {
      setBusy(null);
    }
  }

  const events = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("vi");
    return AUTOMATION_EVENTS.filter((event) => !needle || `${event.label} ${event.detail}`.toLocaleLowerCase("vi").includes(needle));
  }, [search]);

  return <div className={styles.wizard}>
    <nav className={styles.steps} aria-label="Các bước">
      <h2>{draft.id ? "Sửa quy tắc" : "Thêm quy tắc"}</h2>
      <ol className={styles.stepList}>{STEPS.map((label, index) => <li key={label}>
        <button type="button" className={`${styles.step}${index < step || (index <= visited && index !== step && !problem(index)) ? ` ${styles.stepDone}` : ""}`}
          aria-current={index === step ? "step" : undefined} disabled={index > visited} onClick={() => go(index)}
          aria-label={`Bước ${index + 1}: ${label}`}>
          <span className={styles.stepNumber} aria-hidden="true">{index < step ? "✓" : index + 1}</span>
          <span><b>{label}</b><small>{summaries[index]}</small></span>
        </button></li>)}</ol>
      <p className={styles.sentence}>{sentence}</p>
    </nav>

    <section className={styles.panel} aria-labelledby="wizard-step-title">
      <div className={styles.panelHead}><small>Bước {step + 1}/6</small><h3 id="wizard-step-title">{[
        "Khi nào gửi?", "Điều kiện", "Gửi cho ai?", "Gửi qua đâu?", "Xem trước và gửi thử", "Đặt tên và lưu"][step]}</h3>
        <p>{[
          "Chọn việc xảy ra trong hệ thống. Nhóm giống danh sách thông báo.",
          "Gửi mọi lần, hay chỉ khi đúng điều kiện.",
          `Chỉ người có quyền ${item ? lower(item.who.replace(/^Người có quyền /, "")) : "xem việc này"} mới nhận được — để không lộ việc cho người ngoài việc.`,
          "Một quy tắc có thể gửi nhiều nơi cùng lúc.",
          "Nội dung mẫu. Tin thật dùng số chứng từ, tên khách, số tiền lúc xảy ra.",
          "Tên giúp anh/chị nhận ra quy tắc trong danh sách.",
        ][step]}</p></div>

      {step === 0 && <>
        <div className="field"><label htmlFor="rule-search">Tìm sự kiện</label>
          <input id="rule-search" type="search" value={search} autoComplete="off" placeholder="Ví dụ: đơn, giao, nợ" onChange={(input) => setSearch(input.target.value)} /></div>
        <div className={styles.eventGroups}>{CATALOGUE_GROUPS.map((group) => {
          const list = events.filter((event) => event.group === group.value);
          if (!list.length) return null;
          return <fieldset key={group.value} className={styles.eventGroup}><legend>{group.label}</legend>
            {list.map((event) => {
              const existing = overview.rules.filter((rule) => rule.event === event.value && rule.id !== draft.id);
              return <label key={event.value} className={styles.option}>
                <input type="radio" name="rule-event" value={event.value} checked={draft.event === event.value}
                  onChange={() => set({ event: event.value, minAmountVnd: "", problemsOnly: false })} />
                <span><b>{event.label}</b><small>{existing.length ? `Đã có quy tắc: “${existing[0].name}”` : "amount" in event ? "Có điều kiện theo tổng tiền"
                  : "problems" in event ? "Có điều kiện: chỉ khi giao có vấn đề" : event.detail}</small></span></label>;
            })}</fieldset>;
        })}</div>
        {!events.length && <p className={styles.note}>Không có sự kiện nào khớp “{search}”.</p>}
        <p className={styles.note}>Thông báo “Có sẵn” (việc của thợ, giá của khách, tin cho khách…) không cần quy tắc; bật / tắt ở danh sách thông báo.</p>
      </>}

      {step === 1 && item && <>
        {"amount" in item ? <div className="field"><label htmlFor="rule-amount">Chỉ khi tổng tiền từ (để trống = mọi lần)</label>
          <MoneyInput id="rule-amount" value={draft.minAmountVnd} maxDigits={16} onValue={(value) => set({ minAmountVnd: value })} /></div>
          : "problems" in item ? <label className={styles.option}><input type="checkbox" checked={draft.problemsOnly} onChange={(input) => set({ problemsOnly: input.target.checked })} />
            <span><b>Chỉ khi giao thiếu hoặc không giao được</b><small>Bỏ chọn để báo cả khi giao đủ</small></span></label>
          : <p className={styles.note}>Việc này không có điều kiện thêm: mọi lần xảy ra đều gửi.</p>}
      </>}

      {step === 2 && item && <>
        <div className={styles.modes} role="radiogroup" aria-label="Gửi cho ai">{RECIPIENT_MODES.map((mode) => <label key={mode.value} className={styles.option}>
          <input type="radio" name="rule-mode" checked={draft.recipientMode === mode.value} onChange={() => set({ recipientMode: mode.value })} />
          <span><b>{mode.label}</b><small>{mode.value === "PERMISSION" ? `Như hiện nay: ${lower(item.who)}` : mode.detail}</small></span></label>)}</div>
        {"personal" in item && <p className={styles.note}>Việc này chỉ báo đúng người được giao; chọn vai trò hay người chỉ thu hẹp thêm.</p>}
        {draft.recipientMode === "PERMISSION" && <p className={styles.note}>{permissionPeople.allowed} người có quyền: {overview.people
          .filter((person) => person.permissions.includes(item.permission)).map((person) => person.name).join(", ") || "chưa có ai"}.</p>}
        {draft.recipientMode === "ROLES" && <ul className={styles.pickList}>{overview.roles.map((role) => {
          const inRole = overview.people.filter((person) => person.role_id === role.id);
          const allowed = inRole.filter((person) => person.permissions.includes(item.permission));
          return <li key={role.id}><label className={`${styles.pick}${allowed.length ? "" : ` ${styles.pickBlocked}`}`}>
            <input type="checkbox" checked={draft.roleIds.includes(role.id)} onChange={(input) => set({ roleIds: input.target.checked ? [...draft.roleIds, role.id] : draft.roleIds.filter((id) => id !== role.id) })} />
            <span><b>{role.name}</b> <small>· {inRole.length} người</small></span>
            <em className={allowed.length ? styles.good : undefined}>{allowed.length ? `${allowed.length} người có quyền xem` : "Không ai có quyền xem việc này"}</em></label></li>;
        })}</ul>}
        {draft.recipientMode === "PEOPLE" && <ul className={styles.pickList}>{overview.people.map((person) => {
          const allowed = person.permissions.includes(item.permission);
          const chosen = draft.employeeIds.includes(person.id);
          return <li key={person.id} className={chosen && allowed && !person.devices ? styles.pickOff : undefined}>
            <label className={`${styles.pick}${allowed ? "" : ` ${styles.pickBlocked}`}`}>
              <input type="checkbox" checked={chosen && allowed} disabled={!allowed}
                onChange={(input) => set({ employeeIds: input.target.checked ? [...draft.employeeIds, person.id] : draft.employeeIds.filter((id) => id !== person.id) })} />
              <span><b>{person.name}</b> <small>· {person.role_name}</small></span>
              <em className={!allowed ? undefined : person.devices ? styles.good : styles.warn}>{!allowed ? `Không có quyền ${lower(item.who.replace(/^Người có quyền /, ""))}`
                : person.devices ? `${person.devices} máy đang bật` : "Chưa bật thông báo trên máy nào"}</em></label></li>;
        })}</ul>}
        <p className={`${styles.reachBar}${reach.devices ? "" : ` ${styles.zero}`}`} role="status">
          {draft.recipientMode === "PERMISSION" ? `${reach.allowed} người` : `${reach.chosen} người được chọn`} · {reach.enabled} người, {reach.devices} máy đang bật thông báo</p>
        {reach.off.length > 0 && <p className={styles.noteWarn}>{reach.off.map((person) => person.name).join(", ")} sẽ chỉ thấy ở chuông trong app. Nhắc bấm “Bật thông báo trên máy này”
          (máy Xiaomi: bật thêm “thông báo nổi”).</p>}
        {reach.blocked.length > 0 && <p className={styles.note}>{reach.blocked.map((person) => person.name).join(", ")} không có quyền xem việc này nên không nhận.</p>}
      </>}

      {step === 3 && <>
        {AUTOMATION_CHANNELS.map((channel) => <label key={channel.value} className={styles.option}>
          <input type="checkbox" checked={draft.channels.includes(channel.value)}
            onChange={(input) => set({ channels: (input.target.checked ? [...draft.channels, channel.value] : draft.channels.filter((value) => value !== channel.value))
              .sort((a, b) => a === "PUSH" ? -1 : b === "PUSH" ? 1 : 0) })} />
          <span><b>{channel.label}</b><small>{channel.value === "PUSH" ? `${reach.enabled} người, ${reach.devices} máy đang bật` : channel.detail}</small></span></label>)}
        {draft.channels.includes("WEBHOOK") && <div className="field"><label htmlFor="rule-target">Địa chỉ webhook</label>
          <input id="rule-target" value={draft.target} maxLength={300} placeholder="https://…" autoComplete="off" inputMode="url" onChange={(input) => set({ target: input.target.value })} />
          <small className="muted">Chỉ nhập địa chỉ của hệ thống anh/chị tin cậy: nội dung việc (số chứng từ, khách, số tiền) sẽ được gửi tới đó.</small></div>}
        <p className={styles.note}>Telegram và email không còn dùng cho quy tắc. Email chỉ dùng cho đăng nhập.</p>
      </>}

      {step === 4 && item && <>
        <div className={styles.preview}>
          {draft.channels.includes("PUSH") && <div><p className={styles.note}>Màn hình khóa điện thoại</p>
            <div className={styles.lockscreen} aria-label="Xem trước thông báo trên điện thoại"><time>09:41</time><small>Thứ Hai, 16 tháng 11</small>
              <div className={styles.bubble}><span className={styles.bubbleHead}><span>Hiền Xa</span><span>bây giờ</span></span>
                <b>{item.sample.title}</b><span>{item.sample.body}</span></div></div></div>}
          {draft.channels.includes("WEBHOOK") && <div className={styles.webhookBox}><b>Webhook · {draft.target || "địa chỉ chưa nhập"}</b>
            <code>{JSON.stringify({ kind: item.value, title: item.sample.title, body: item.sample.body }, null, 2)}</code></div>}
        </div>
        <div className={styles.testRow}>
          <button type="button" className="button button-secondary" disabled={busy !== null || !draft.channels.includes("PUSH")} onClick={() => { void test(); }}>
            {busy === "test" ? "Đang gửi…" : "Gửi thử cho tôi"}</button>
          <span className={overview.my_devices ? styles.note : styles.noteWarn}>{overview.my_devices
            ? `Chỉ tới ${overview.my_devices} máy của anh/chị — không gửi cho ${reach.allowed} người nhận, không gửi webhook.`
            : "Máy của anh/chị chưa bật thông báo: bật ở trang Thông báo để gửi thử."}</span>
        </div>
      </>}

      {step === 5 && <>
        <div className="field"><label htmlFor="rule-name">Tên quy tắc</label>
          <input id="rule-name" value={draft.name} minLength={3} maxLength={120} required onChange={(input) => set({ name: input.target.value })} /></div>
        <label className={styles.option}><input type="checkbox" checked={draft.active} onChange={(input) => set({ active: input.target.checked })} />
          <span><b>Bật quy tắc ngay</b><small>Bỏ chọn để lưu mà chưa gửi</small></span></label>
        <p className={styles.sentence}>{sentence}</p>
      </>}

      {message && <div className={`form-message${message.ok ? " success" : ""}`} role={message.ok ? "status" : "alert"}>{message.text}
        {message.conflict && <> <button type="button" className={styles.linkButton} onClick={() => { router.refresh(); onClose(); }}>Tải bản mới</button></>}</div>}
      <div className={styles.panelActions}>
        <button type="button" className="button button-secondary" onClick={() => step === 0 ? onClose() : go(step - 1)}>{step === 0 ? "Hủy" : "Quay lại"}</button>
        {step < 5 ? <button type="button" className="button button-primary" onClick={() => go(step + 1)}>{step === 4 ? "Tiếp tục: Lưu" : "Tiếp tục"}</button>
          : <button type="button" className="button button-primary" disabled={busy !== null} onClick={() => { void save(); }}>{busy === "save" ? "Đang lưu…" : "Lưu quy tắc"}</button>}
      </div>
    </section>
  </div>;
}
