"use client";

import { useEffect, useState } from "react";
import { percentile, subscribeTiming, timingSnapshot, timingVerdict, type TimingMetric } from "@/lib/uat-browser-timing";

export function UatBrowserTiming() {
  const [snapshot, setSnapshot] = useState<ReturnType<typeof timingSnapshot>>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("uatTiming") !== "1") return;
    const update = () => setSnapshot(timingSnapshot());
    update();
    return subscribeTiming(update);
  }, []);
  if (!snapshot) return null;
  return <section className="card card-pad" aria-label="Đo thời gian phản hồi giao diện" data-testid="uat-timing-panel" data-count={snapshot.samples.length} data-pending={snapshot.pending ? "true" : "false"}>
    <h2>Đo thời gian phản hồi giao diện</h2>
    <p>Đo từ lúc bấm đến khi nội dung hiển thị, chỉ trong thẻ trình duyệt này. Giữ cả mẫu lỗi và lần tải đầu; không thu thập thông tin người dùng hoặc dữ liệu nghiệp vụ.</p>
    {(["ADMIN_SHELL_BROWSER", "DASHBOARD_BROWSER_CONTENT"] as TimingMetric[]).map((metric) => {
      const samples = snapshot.samples.filter((sample) => sample.metric === metric);
      const budget = metric === "ADMIN_SHELL_BROWSER" ? 300 : 2000;
      const verdict = timingVerdict(samples, budget);
      return <p key={metric}>{metric === "ADMIN_SHELL_BROWSER" ? "Điều hướng quản trị" : "Nội dung tổng quan"}: {samples.length.toLocaleString("vi-VN")} mẫu; thời gian ở mức 95%: {percentile(samples.map((s) => s.durationMs), 0.95)?.toLocaleString("vi-VN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) ?? "Đang chờ"} ms; {verdict === "PASS" ? "Đạt" : verdict === "FAIL" ? "Chưa đạt" : "Đang chờ"}</p>;
    })}
    {snapshot.storageError && <p role="alert">Không lưu được phép đo. Chưa đủ bằng chứng để kết luận đạt.</p>}
    <details><summary>Chi tiết dữ liệu kiểm thử</summary><pre data-testid="uat-timing-state">{JSON.stringify(snapshot)}</pre></details>
  </section>;
}
