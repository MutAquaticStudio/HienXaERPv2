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
  return <section className="card card-pad" aria-label="UAT browser timing" data-testid="uat-timing-panel" data-count={snapshot.samples.length} data-pending={snapshot.pending ? "true" : "false"}>
    <h2>UAT browser timing (tab-local only)</h2>
    <p>Click to painted useful UI. No API duration, identities, query values or business telemetry. Errors and cold/first samples remain in the raw record.</p>
    {(["ADMIN_SHELL_BROWSER", "DASHBOARD_BROWSER_CONTENT"] as TimingMetric[]).map((metric) => {
      const samples = snapshot.samples.filter((sample) => sample.metric === metric);
      const budget = metric === "ADMIN_SHELL_BROWSER" ? 300 : 2000;
      return <p key={metric}>{metric}: n={samples.length}; p95={percentile(samples.map((s) => s.durationMs), 0.95)?.toFixed(3) ?? "pending"} ms; {timingVerdict(samples, budget)}</p>;
    })}
    {snapshot.storageError && <p role="alert">Measurement storage failed. Do not declare timing PASS.</p>}
    <details><summary>Raw measurement samples</summary><pre data-testid="uat-timing-state">{JSON.stringify(snapshot)}</pre></details>
  </section>;
}
