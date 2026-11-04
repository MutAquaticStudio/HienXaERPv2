"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { disconnectZaloAction, saveZaloTemplateAction, sendZaloTestAction, setZaloModeAction, type ZaloActionResult } from "@/modules/zalo/actions";
import { startZaloOAuthAction } from "@/modules/zalo/connect-actions";
import { ZALO_EVENTS, ZALO_STATE_LABEL, type ZaloEventCode, type ZaloStatus, type ZaloTemplate } from "@/modules/zalo/presentation";

function Message({ result }: { result: ZaloActionResult | null }) {
  if (!result) return null;
  return <p className={`form-message${result.ok ? " success" : ""}`} role={result.ok ? "status" : "alert"}>{result.message}</p>;
}

/** D47 Cài đặt → Zalo OA: connection, sending mode, the template of each event, a test message and the last 24 hours. */
export function ZaloSettings({ status, callbackUrl = "<địa chỉ ứng dụng>/api/zalo/oauth/callback" }: { status: ZaloStatus; callbackUrl?: string }) {
  const router = useRouter();
  const [appId, setAppId] = useState(status.app_id ?? "");
  const [busy, setBusy] = useState(false);
  const [connect, setConnect] = useState<ZaloActionResult | null>(null);
  const [mode, setMode] = useState<ZaloActionResult | null>(null);
  const confirm = useConfirm();
  const connected = status.state === "CONNECTED";

  async function start() {
    setBusy(true); setConnect(null);
    const result = await startZaloOAuthAction(appId).catch(() => null);
    setBusy(false);
    if (result?.ok && result.url) { window.location.assign(result.url); return; }
    setConnect(result ?? { ok: false, message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." });
  }
  function disconnect() {
    confirm.ask({ title: "Ngắt kết nối Zalo OA?", body: <p>Hệ thống sẽ ngừng gửi tin Zalo cho khách cho tới khi kết nối lại.</p>, confirmLabel: "Ngắt kết nối", danger: true, run: async () => {
      setBusy(true);
      setConnect(await disconnectZaloAction().catch(() => null));
      setBusy(false); router.refresh();
    } });
  }
  async function applyMode(next: "development" | "production") {
    setMode(await setZaloModeAction(next).catch(() => null)); router.refresh();
  }
  // D59: going to real customers costs money per message — asked in the app's popup; going back to test mode is not.
  function changeMode(next: "development" | "production") {
    if (next === "production") confirm.ask({ title: "Gửi cho khách thật?", body: <p>Từ lúc này tin Zalo đi tới số điện thoại của khách và <strong>mỗi tin trừ tiền ví ZBS</strong> của cửa hàng.</p>,
      confirmLabel: "Bật gửi cho khách thật", danger: true, run: () => applyMode(next) });
    else void applyMode(next);
  }

  return <div className="page-stack">
    <section className="card card-pad" aria-labelledby="zalo-connection">
      <div className="section-head flush"><h2 id="zalo-connection">Kết nối</h2>
        <StatusBadge tone={connected ? "success" : status.state === "NEEDS_RECONNECT" ? "danger" : "warning"}>{ZALO_STATE_LABEL[status.state]}</StatusBadge></div>
      <dl className="detail-grid">
        <div className="detail-item"><dt>OA ID</dt><dd>{status.oa_id ?? "Chưa có"}</dd></div>
        <div className="detail-item"><dt>Phiên kết nối hết hạn lúc</dt><dd>{status.access_expires_at ? formatBusinessDateTime(status.access_expires_at) : "—"} <small className="table-subline">Tự gia hạn khi còn dưới 6 giờ</small></dd></div>
        <div className="detail-item"><dt>Hạn mức tin hôm nay</dt><dd>{status.daily_quota ? `Còn ${status.remaining_quota ?? "?"} / ${status.daily_quota}` : "Chưa có (hiện sau tin đầu tiên)"}</dd></div>
        <div className="detail-item"><dt>Khóa bí mật Zalo App</dt><dd>{status.app_secret_set ? "Đã lưu trong kho bí mật của hệ thống" : "Chưa lưu"}</dd></div>
      </dl>
      {status.last_error && <p className="form-message" role="alert">Lỗi gần nhất: {status.last_error.replace(/:\s.*$/, "")}</p>}
      {!status.app_secret_set && <p className="settings-warning">Trước khi kết nối cần kỹ thuật lưu khóa bí mật của Zalo App vào hệ thống (xem “Dành cho kỹ thuật” bên dưới).</p>}
      <div className="inline-actions">
        <label className="field"><span>App ID (developers.zalo.me)</span>
          <input value={appId} onChange={(event) => setAppId(event.target.value)} inputMode="numeric" placeholder="Ví dụ 1234567890123456789" /></label>
        <button className="button button-primary" type="button" disabled={busy || !appId.trim()} onClick={start}>{connected ? "Kết nối lại" : "Kết nối Zalo OA"}</button>
        {status.state !== "DISCONNECTED" && <button className="button button-danger" type="button" disabled={busy} onClick={disconnect}>Ngắt kết nối</button>}
      </div>
      <Message result={connect} />
      <details className="settings-tech"><summary>Dành cho kỹ thuật</summary>
        <p className="muted">Lưu <strong>Secret Key</strong> của Zalo App vào Supabase → Project Settings → Vault, tên <code>hx_zalo_app_secret</code>; khóa không đi qua ứng dụng.
          Trong Zalo App, khai báo địa chỉ gọi lại (Callback URL): <code>{callbackUrl}</code>.</p>
      </details>
    </section>

    <section className="card card-pad" aria-labelledby="zalo-mode">
      <h2 id="zalo-mode">Chế độ gửi</h2>
      <fieldset className="segmented-radio"><legend>Gửi tới</legend>
        <label><input type="radio" name="zalo-mode" checked={status.send_mode === "development"} onChange={() => changeMode("development")} /> Thử nghiệm — chỉ quản trị viên OA/App nhận</label>
        <label><input type="radio" name="zalo-mode" checked={status.send_mode === "production"} onChange={() => changeMode("production")} /> Khách thật — trừ tiền ví ZBS mỗi tin</label>
      </fieldset>
      <Message result={mode} />
    </section>

    {/* D59: until the OA is connected the templates are one step later — folded, not a wall of forms. */}
    <section className="card card-pad" aria-labelledby="zalo-templates">
      <details className="zalo-templates" open={connected}>
        <summary><h2 id="zalo-templates">Mẫu tin theo sự kiện</h2>{!connected && <span className="muted"> · điền sau khi kết nối</span>}</summary>
        <p className="muted">Gửi tới số điện thoại chính của khách, mỗi chứng từ một lần. Khách tắt “Nhận thông báo Zalo” thì không gửi. Khi đăng ký mẫu trên Zalo, khai báo đúng tên tham số bên dưới (kiểu chữ). Đổi mã hoặc bật / tắt xong thì bấm “Lưu” của dòng đó.</p>
        <div className="zalo-template-list">{status.templates.map((template) => <TemplateRow key={template.event_code} template={template} />)}</div>
      </details>
    </section>

    <section className="card card-pad" aria-labelledby="zalo-test"><h2 id="zalo-test">Gửi thử</h2><TestForm templates={status.templates} connected={connected} sendMode={status.send_mode} /></section>

    {connected && <section className="card card-pad" aria-labelledby="zalo-day">
      <h2 id="zalo-day">24 giờ qua</h2>
      <dl className="detail-grid">
        <div className="detail-item"><dt>Đã gửi</dt><dd>{status.last_24h.sent}</dd></div>
        <div className="detail-item"><dt>Đang chờ / thử lại</dt><dd>{status.last_24h.waiting}</dd></div>
        <div className="detail-item"><dt>Bỏ qua (số không dùng Zalo, mẫu bị từ chối…)</dt><dd>{status.last_24h.dead}</dd></div>
      </dl>
    </section>}
    {confirm.dialog}
  </div>;
}

function TemplateRow({ template }: { template: ZaloTemplate }) {
  const router = useRouter();
  const event = ZALO_EVENTS.find((item) => item.code === template.event_code);
  const [templateId, setTemplateId] = useState(template.template_id ?? "");
  const [active, setActive] = useState(template.active);
  const [result, setResult] = useState<ZaloActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setResult(await saveZaloTemplateAction({ event: template.event_code, templateId: templateId.trim(), active, version: template.version }).catch(() => null));
    setBusy(false); router.refresh();
  }
  const dirty = templateId.trim() !== (template.template_id ?? "") || active !== template.active;
  const name = event?.label ?? template.event_code;
  return <div className="zalo-template" role="group" aria-label={name}>
    <header><strong>{name}</strong><small className="muted"> · {event?.tag}</small></header>
    <p className="muted">{event?.sample}</p>
    <p className="zalo-params">Tham số: {template.params.map((param) => <code key={param}>{param}</code>)}</p>
    <div className="inline-actions">
      <label className="field"><span>Mã mẫu tin (template ID)<span className="sr-only"> — {name}</span></span><input value={templateId} inputMode="numeric" onChange={(e) => setTemplateId(e.target.value)} placeholder="Chưa có" /></label>
      <label className="check-row"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Bật gửi<span className="sr-only"> {name}</span></label>
      <button className="button button-secondary" type="button" disabled={busy || !dirty} onClick={save}>Lưu<span className="sr-only"> mẫu {name}</span></button>
      {dirty && <span className="settings-dirty" role="status">Chưa lưu</span>}
    </div>
    <Message result={result} />
  </div>;
}

function TestForm({ templates, connected, sendMode }: { templates: ZaloTemplate[]; connected: boolean; sendMode: string }) {
  const router = useRouter();
  const ready = templates.filter((template) => template.template_id);
  const [event, setEvent] = useState<ZaloEventCode | "">(ready[0]?.event_code ?? "");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<ZaloActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  if (!connected || !ready.length) return <p className="muted">Kết nối Zalo OA và nhập ít nhất một mã mẫu tin để gửi thử.</p>;
  function ask() {
    confirm.ask({ title: "Gửi tin thử?", body: <p>Một tin Zalo thật sẽ được gửi tới {phone.trim()}{sendMode === "production" ? " và trừ tiền ví ZBS" : ""}.</p>, confirmLabel: "Gửi tin thử", run: send });
  }
  async function send() {
    setBusy(true);
    setResult(await sendZaloTestAction({ event, phone, operationId: crypto.randomUUID() }).catch(() => null));
    setBusy(false); router.refresh();
  }
  return <>
    <div className="inline-actions">
      <label className="field"><span>Mẫu</span><select value={event} onChange={(e) => setEvent(e.target.value as ZaloEventCode)}>
        {ready.map((template) => <option key={template.event_code} value={template.event_code}>{ZALO_EVENTS.find((item) => item.code === template.event_code)?.label}</option>)}</select></label>
      <label className="field"><span>Số điện thoại nhận</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="0912 345 678" /></label>
      <button className="button button-secondary" type="button" disabled={busy || !phone.trim()} onClick={ask}>Gửi thử</button>
    </div>
    <p className="muted">Ở chế độ thử, Zalo chỉ gửi tới số của quản trị viên OA hoặc App.</p>
    <Message result={result} />
    {confirm.dialog}
  </>;
}
