"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { reportExportStateLabel } from "@/modules/finance/presentation";

type JobStatus = { id: string; state: string; processedRows: number; safeError?: string | null; nextRunAt?: string };
type Format = "xlsx" | "csv";
const FORMAT_NAME: Record<Format, string> = { xlsx: "Excel", csv: "CSV" };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** The Vietnamese name from `filename*=UTF-8''…`, else the plain one. */
export function fileNameFrom(header: string | null, fallback: string) {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header ?? "")?.[1];
  if (encoded) { try { return decodeURIComponent(encoded); } catch { /* fall through */ } }
  return /filename="([^"]+)"/i.exec(header ?? "")?.[1] ?? fallback;
}

/** A refusal from the export routes, in words: their `message`/`error` is Vietnamese; codes alone become a plain sentence. */
async function failure(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.error === "string" && /[^\x00-\x7F]/.test(body.error)) return body.error;
  return fallback;
}

const withFormat = (href: string, format: Format) => `${href}${href.includes("?") ? "&" : "?"}format=${format}`;

/**
 * D57: "Xuất Excel" (opens right in Excel: numbers stay numbers) and "Xuất CSV" (plain data). The file is fetched here
 * so the page says what is happening and shows a refusal in words. A very long finance report is built as a resumable
 * job (Phải thu / Phải trả over 1.000 dòng); its progress shows in the same line.
 */
export function ReportExportButton({ href, fallbackName }: { href: string; fallbackName: string }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [status, setStatus] = useState("");
  const [jobId, setJobId] = useState("");
  const storageUrl = new URL(href, "http://local");
  storageUrl.searchParams.delete("cutoff");
  const storageKey = `hx-report-export:${storageUrl.pathname}?${storageUrl.searchParams.toString()}`;

  useEffect(() => {
    let saved = "";
    try { saved = window.sessionStorage.getItem(storageKey) ?? ""; } catch { /* private mode */ }
    const timer = window.setTimeout(() => setJobId(saved), 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  function remember(value: string) {
    try { if (value) window.sessionStorage.setItem(storageKey, value); else window.sessionStorage.removeItem(storageKey); } catch { /* private mode */ }
  }

  async function start(format: Format) {
    setBusy(format);
    setStatus(`Đang tạo file ${FORMAT_NAME[format]}…`);
    try {
      let activeJobId = jobId;
      if (!activeJobId) {
        const response = await fetch(withFormat(href, format), { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error(await failure(response, "Chưa xuất được file. Thử lại sau ít phút."));
        if (!response.headers.get("content-type")?.includes("json")) {
          download(await response.blob(), fileNameFrom(response.headers.get("content-disposition"), `${fallbackName}.${format}`));
          setStatus(`Đã tải file ${FORMAT_NAME[format]}.`);
          return;
        }
        const created = await response.json() as { jobId?: string };
        if (!created.jobId) throw new Error("Chưa xuất được file. Thử lại sau ít phút.");
        activeJobId = created.jobId;
        setJobId(activeJobId);
        remember(activeJobId);
      }
      for (;;) {
        const progress = await fetch(`/api/reports/export?job=${encodeURIComponent(activeJobId)}`, { method: "POST", cache: "no-store" });
        if (!progress.ok) throw new Error(await failure(progress, "Chưa làm tiếp được việc xuất file. Bấm tiếp tục để thử lại."));
        const job = await progress.json() as JobStatus;
        setStatus(`Báo cáo nhiều dòng: đã xử lý ${job.processedRows.toLocaleString("vi-VN")} dòng · ${reportExportStateLabel(job.state)}`);
        if (job.state === "COMPLETED") {
          const file = await fetch(withFormat(`/api/reports/export?job=${encodeURIComponent(activeJobId)}&download=1`, format), { cache: "no-store" });
          if (!file.ok) throw new Error(await failure(file, "Chưa tải được file đã xuất xong. Bấm tiếp tục để thử lại."));
          download(await file.blob(), fileNameFrom(file.headers.get("content-disposition"), `${fallbackName}.${format}`));
          setStatus(`Đã tải file ${FORMAT_NAME[format]} (${job.processedRows.toLocaleString("vi-VN")} dòng).`);
          remember("");
          setJobId("");
          return;
        }
        if (job.state === "FAILED") throw new Error(job.safeError || "Xuất file không thành công. Thử lại sau ít phút.");
        const due = job.nextRunAt ? new Date(job.nextRunAt).getTime() - Date.now() : 0;
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(250, Math.min(30000, due))));
      }
    } catch (error) {
      setStatus(error instanceof Error && /[^\x00-\x7F]/.test(error.message) ? error.message : "Mất kết nối khi xuất file. Kiểm tra mạng rồi bấm lại.");
    } finally {
      setBusy(null);
    }
  }

  const resume = jobId ? "Tiếp tục " : "Xuất ";
  return <div className="report-export">
    <div className="report-export-buttons" role="group" aria-label="Xuất báo cáo">
      <button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => void start("xlsx")}>
        <FileSpreadsheet aria-hidden size={18} />{busy === "xlsx" ? "Đang tạo…" : `${resume}Excel`}</button>
      <button className="button button-secondary" type="button" disabled={busy !== null} onClick={() => void start("csv")}>
        <FileText aria-hidden size={18} />{busy === "csv" ? "Đang tạo…" : `${resume}CSV`}</button>
    </div>
    <span role="status" aria-live="polite" className="report-export-status">{status}</span>
  </div>;
}
