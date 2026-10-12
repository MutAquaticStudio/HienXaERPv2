import { formatBusinessDateTime } from "@/lib/core/business-time";
export function formatServiceSchedule(instant: string): string {
  return formatBusinessDateTime(instant);
}
