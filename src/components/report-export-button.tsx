"use client";
import { reportExportStateLabel } from "@/modules/finance/presentation";


import { useEffect, useState } from "react";

type JobStatus = { id: string; state: string; processedRows: number; safeError?: string | null; nextRunAt?: string };

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

export function ReportExportButton({ href, filename }: { href: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [jobId, setJobId] = useState("");
  const storageUrl = new URL(href, "http://local");
  storageUrl.searchParams.delete("cutoff");
  const storageKey = `hx-report-export:${storageUrl.searchParams.toString()}`;

  useEffect(() => {
    const saved = window.sessionStorage.getItem(storageKey);
    const timer = window.setTimeout(() => setJobId(saved ?? ""), 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  async function start() {
    setBusy(true);
    setStatus("Đang chuẩn bị file xuất...");
    try {
      let activeJobId = jobId;
      if (!activeJobId) {
        const response = await fetch(href, { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error("Không thể bắt đầu xuất file.");
        if (response.headers.get("content-type")?.includes("text/csv")) {
          download(await response.blob(), filename);
          setStatus("Đã tải file CSV.");
          return;
        }
        const created = await response.json() as { jobId: string };
        if (!created.jobId) throw new Error("Không nhận được mã tác vụ xuất tệp.");
        activeJobId = created.jobId;
        setJobId(activeJobId);
        window.sessionStorage.setItem(storageKey, activeJobId);
      }
      for (;;) {
        const progress = await fetch(`/api/reports/export?job=${encodeURIComponent(activeJobId)}`, { method: "POST", cache: "no-store" });
        if (!progress.ok) throw new Error("Không thể tiếp tục tác vụ xuất tệp.");
        const job = await progress.json() as JobStatus;
        setStatus(`Đã xử lý ${job.processedRows.toLocaleString("vi-VN")} dòng · ${reportExportStateLabel(job.state)}`);
        if (job.state === "COMPLETED") {
          const file = await fetch(`/api/reports/export?job=${encodeURIComponent(activeJobId)}&download=1`, { cache: "no-store" });
          if (!file.ok) throw new Error("Không thể tải file đã hoàn tất.");
          download(await file.blob(), filename);
          setStatus(`Đã tải ${job.processedRows} dòng CSV.`);
          window.sessionStorage.removeItem(storageKey);
          setJobId("");
          return;
        }
        if (job.state === "FAILED") throw new Error(job.safeError || "Xuất tệp thất bại.");
        const due = job.nextRunAt ? new Date(job.nextRunAt).getTime() - Date.now() : 0;
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(250, Math.min(30000, due))));
      }
    } catch (error) {
      setStatus(error instanceof Error && error.message.startsWith("Không")
        ? error.message
        : "Kết nối bị gián đoạn. Bấm Tiếp tục CSV để thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="action-cluster"><button className="button button-secondary" type="button" disabled={busy} onClick={() => void start()}>{jobId ? "Tiếp tục CSV" : "Xuất CSV"}</button>{status && <span role="status" className="muted">{status}</span>}{jobId && <a className="code-link" href={`/api/reports/export?job=${encodeURIComponent(jobId)}`}>Tác vụ {jobId.slice(0, 8)}</a>}</div>;
}
