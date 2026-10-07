import { parseBusinessDateTime } from "@/lib/core/business-time";

export function dashboardSnapshotCutoff(to: string | undefined, knowledgeCutoff: string) {
  const now = Date.parse(knowledgeCutoff);
  if (!Number.isFinite(now)) throw new Error("invalid_snapshot_knowledge_cutoff");
  if (!to) return new Date(now).toISOString();
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(to) ? parseBusinessDateTime(`${to}T00:00`) : null;
  if (!requested) throw new Error("invalid_snapshot_business_date");
  return new Date(Math.min(Date.parse(requested), now)).toISOString();
}
