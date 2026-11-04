"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { clearAiApiKeyAction, saveAiApiKeyAction, type AiKeyActionResult } from "@/modules/ai/settings-actions";

export type AiKeyStatus = { in_app: boolean; last4: string | null; updated_at: string | null; updated_by_name: string | null };

/** D50 Cài đặt → Trợ lý AI: the Claude API key — which one is in use, enter / replace it, remove it. The key is never shown. */
export function AiSettings({ status, environmentKey }: { status: AiKeyStatus; environmentKey: boolean }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiKeyActionResult | null>(null);
  const keyLooksRight = /^sk-ant-[A-Za-z0-9_-]{20,250}$/.test(apiKey.trim());
  const confirm = useConfirm();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!keyLooksRight || busy) return;
    setBusy(true); setResult(null);
    const outcome = await saveAiApiKeyAction({ apiKey: apiKey.trim(), operationId: crypto.randomUUID() }).catch(() => null);
    setBusy(false);
    setResult(outcome ?? { ok: false, message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." });
    if (outcome?.ok) { setApiKey(""); router.refresh(); }
  }
  function clear() {
    const fallback = environmentKey ? "Trợ lý sẽ dùng lại khóa trên máy chủ (Vercel)." : "Trợ lý AI sẽ ngừng trả lời cho tới khi có khóa mới.";
    confirm.ask({ title: "Gỡ khóa API trong ứng dụng?", body: <p>{fallback}</p>, confirmLabel: "Gỡ khóa", danger: true, run: removeKey });
  }
  async function removeKey() {
    setBusy(true); setResult(null);
    const outcome = await clearAiApiKeyAction({ operationId: crypto.randomUUID() }).catch(() => null);
    setBusy(false);
    setResult(outcome ?? { ok: false, message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." });
    router.refresh();
  }

  const inUse = status.in_app
    ? <><StatusBadge tone="success">Khóa trong ứng dụng</StatusBadge> <span>…{status.last4}</span></>
    : environmentKey ? <StatusBadge tone="info">Khóa trên máy chủ (Vercel)</StatusBadge> : <StatusBadge tone="danger">Chưa có khóa</StatusBadge>;

  return <div className="page-stack">
    <section className="card card-pad" aria-label="Khóa API Claude">
      <div className="section-head flush"><h2>Khóa API Claude</h2></div>
      <dl className="detail-grid">
        <div className="detail-item"><dt>Đang dùng</dt><dd>{inUse}</dd></div>
        {status.updated_at && <div className="detail-item"><dt>Lần đổi gần nhất</dt>
          <dd>{formatBusinessDateTime(status.updated_at)}{status.updated_by_name ? ` · ${status.updated_by_name}` : ""}</dd></div>}
      </dl>
      <p className="muted">Khóa lấy ở console.anthropic.com → API Keys. Khóa được cất trong kho bí mật của hệ thống, chỉ máy chủ đọc được; sau khi lưu chỉ còn hiện 4 ký tự cuối. Chi phí tính vào tài khoản Anthropic của khóa.</p>
      <form className="form-stack ai-key-form" onSubmit={save}>
        <div className="field"><label htmlFor="ai-api-key">{status.in_app ? "Khóa API mới (thay khóa đang dùng)" : "Khóa API"}</label>
          <input id="ai-api-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-ant-…" aria-describedby="ai-key-hint" disabled={busy} />
          <small id="ai-key-hint" className="muted">Hệ thống thử khóa với Claude trước khi lưu; khóa sai sẽ không thay khóa đang dùng.</small>
        </div>
        <div className="form-actions">
          <button className="button button-primary" disabled={!keyLooksRight || busy}>{busy ? "Đang kiểm tra…" : status.in_app ? "Thay khóa" : "Lưu khóa"}</button>
          {status.in_app && <button type="button" className="button button-secondary" onClick={clear} disabled={busy}>Gỡ khóa</button>}
        </div>
      </form>
      {result && <p className={`form-message${result.ok ? " success" : ""}`} role={result.ok ? "status" : "alert"}>{result.message}</p>}
    </section>
    {confirm.dialog}
    <section className="card card-pad" aria-label="Mô hình Claude">
      <h2>Mô hình Claude</h2>
      <p className="muted">Mỗi người tự chọn mô hình ngay trong khung chat với trợ lý (Sonnet 5.5 mặc định, Opus 5.5 suy luận kỹ hơn, Haiku 5.5 nhanh và rẻ). Chi phí tháng ở trang Trợ lý AI tính theo giá của mô hình từng lượt hỏi.</p>
    </section>
  </div>;
}
