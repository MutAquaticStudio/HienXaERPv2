/**
 * D85 "Điều phối hiện trường (thợ chính)": the lead worker's board — what waits for a person, today's jobs by worker — and
 * the rules the screen shows. The database decides (permission, free times, who declined, first tap wins); this file only
 * orders and words what it returns.
 */

export const FIELD_DISPATCH_PERMISSION = "work.field_dispatch";

/** A free worker + truck for a waiting delivery, and when (the dispatch suggestion's own times). */
export type FieldDispatchPair = {
  employee_id: string;
  vehicle_id: string;
  start_at: string;
  end_at: string;
  default_driver?: boolean;
  same_site?: boolean;
  day_count?: number;
  /** The office's dispatch suggestion (Gợi ý mode) when this is it. */
  from_proposal?: boolean;
};

export type FieldDispatchDeclined = { employee_id: string; name: string; reason: string; at: string };

export type FieldDispatchWaitingDelivery = {
  kind: "DELIVERY";
  id: string;
  number: string;
  version: number;
  requested_at?: string;
  customer_name?: string;
  site_name?: string;
  address?: string;
  lines: { material_name: string; quantity: string; unit: string }[];
  declined?: FieldDispatchDeclined[];
  /** Every free worker + truck; loaded when the sheet opens (field_dispatch_options), absent on the board. */
  pairs?: FieldDispatchPair[];
  /** The office's dispatch suggestion while it can still be used: the one-tap "Giao cho …". */
  suggestion?: FieldDispatchPair | null;
};

export type FieldDispatchWaitingService = {
  kind: "SERVICE_JOB";
  /** The job (work item) id. */
  id: string;
  number: string;
  version: number;
  requested_at: string;
  duration_minutes: number;
  title: string;
  description?: string;
  customer_name?: string;
  site_name?: string;
  address?: string;
  quantity?: string;
  unit?: string;
  /** When each worker could do it; loaded when the sheet opens, absent on the board. */
  candidates?: { employee_id: string; start_at: string }[];
};

export type FieldDispatchWaiting = FieldDispatchWaitingDelivery | FieldDispatchWaitingService;

/** One of today's jobs of a branch worker, and whether a lead gave it ("field"). */
export type FieldDispatchGiven = {
  kind: "DELIVERY" | "SERVICE_JOB";
  /** The delivery id, or the service job id. */
  id: string;
  /** The job (work item) a person is changed on. */
  work_item_id?: string;
  number: string;
  version: number;
  employee_id: string;
  vehicle_id?: string;
  start_at: string;
  end_at?: string;
  title?: string;
  site_name?: string;
  address?: string;
  state: string;
  result_kind?: string;
  can_change: boolean;
  receiver_phone?: string;
  shortfall?: string;
  previous_employee_id?: string;
  field?: { action: "field_assigned" | "field_claimed" | "field_reassigned"; by_employee_id?: string; by_name?: string; by_me?: boolean };
};

export type FieldDispatchWorker = { id: string; name: string; me?: boolean; clocked_in_at?: string; free_from?: string };

export type FieldDispatchBoard = {
  branch_id: string;
  now: string;
  me: string;
  stop_minutes: number;
  waiting: FieldDispatchWaiting[];
  given: FieldDispatchGiven[];
  workers: FieldDispatchWorker[];
  vehicles: { id: string; code: string; plate_number?: string }[];
};

export type FieldDispatchSummary = { waiting: number; declined: number; given: number; given_workers: number; short: number };

/** What the sheet sends: give a waiting job (ASSIGN) or change the person on one of today's (REASSIGN). */
export type FieldDispatchCommand = {
  kind: "DELIVERY" | "SERVICE_JOB";
  mode: "ASSIGN" | "REASSIGN";
  /** The delivery id; for a service job, the job (work item) id. */
  targetId: string;
  employeeId: string;
  vehicleId?: string | null;
  /** A time the lead picked; null = the time the system computes. */
  chosenStart?: string | null;
  version: number;
  operationId: string;
};

export type FieldDispatchResult =
  | { ok: true; workItemId?: string; startAt?: string }
  | { ok: false; message: string; unknown?: boolean; reload?: boolean; nextFreeAt?: string };

const zone = { timeZone: "Asia/Ho_Chi_Minh" } as const;
const clock = new Intl.DateTimeFormat("vi-VN", { ...zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { ...zone, day: "2-digit", month: "2-digit" });
const dayKey = new Intl.DateTimeFormat("en-CA", zone);

/** "09:30", or "09:30 18/11" when it is not on the given day. */
export function fieldTime(value: string | undefined | null, today?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = clock.format(date);
  return today && dayKey.format(date) === dayKey.format(new Date(today)) ? time : `${time} ${dayMonth.format(date)}`;
}

/** "1 giờ 15 phút". */
export function lateText(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} giờ` : "", rest ? `${rest} phút` : ""].filter(Boolean).join(" ");
}

export function fieldDispatchMessage(raw: string, hint?: string | null, today?: string) {
  const next = /next_free_at=([0-9TZ:.-]+)/.exec(hint ?? "")?.[1];
  if (raw.includes("field_dispatch_busy")) {
    return next ? `Người hoặc xe đã có việc lúc đó. Rảnh từ ${fieldTime(next, today)}.` : "Người hoặc xe đã có việc lúc đó. Chọn giờ khác.";
  }
  if (raw.includes("work_resource_schedule_collision")) return "Người hoặc xe đã có việc trùng giờ. Chọn giờ khác.";
  if (raw.includes("field_dispatch_taken")) return "Việc này vừa có người nhận (văn phòng, thợ chính khác hoặc thợ tự nhận). Danh sách đã tải lại.";
  if (raw.includes("field_dispatch_stale") || raw.includes("delivery_assignment_version_conflict")) return "Việc vừa được cập nhật. Danh sách đã tải lại, chọn lại giúp.";
  if (raw.includes("field_dispatch_locked") || raw.includes("delivery_reassignment_after_work_started_forbidden")) {
    return "Thợ đã lấy hàng lên xe hoặc đã bắt đầu việc, không đổi người được nữa. Cần văn phòng xử lý.";
  }
  if (raw.includes("field_dispatch_not_open")) return "Việc này không còn chờ người (đã hủy, quá 14 ngày tới hoặc văn phòng đã tắt tự điều phối). Danh sách đã tải lại.";
  if (raw.includes("field_dispatch_worker_declined")) return "Người này đã từ chối phiếu này. Chọn người khác.";
  if (raw.includes("field_dispatch_same_worker")) return "Việc đang giao cho người này. Chọn người khác.";
  if (raw.includes("field_dispatch_unavailable")) return "Người hoặc xe này không nhận được việc này nữa. Chọn người hoặc xe khác.";
  if (raw.includes("field_dispatch_time_out_of_range")) return "Chọn giờ trong 14 ngày tới, không sớm hơn bây giờ quá 1 giờ.";
  if (raw.includes("operation_payload_conflict")) return "Lần bấm trước có nội dung khác. Tải lại trang rồi chọn lại.";
  if (raw.includes("forbidden")) return "Tài khoản này không còn quyền điều phối ở chi nhánh này.";
  return "Chưa giao được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.";
}

/** Whether the board must be loaded again after this refusal (someone else changed the job). */
export function fieldDispatchNeedsReload(raw: string) {
  return ["field_dispatch_taken", "field_dispatch_stale", "field_dispatch_not_open", "field_dispatch_locked", "delivery_assignment_version_conflict"]
    .some((code) => raw.includes(code));
}

export function nextFreeAt(hint?: string | null) {
  return /next_free_at=([0-9TZ:.-]+)/.exec(hint ?? "")?.[1];
}

/** The state of one of today's jobs, as the lead reads it. */
export function givenStateLabel(row: Pick<FieldDispatchGiven, "kind" | "state" | "result_kind">) {
  if (row.kind === "DELIVERY") {
    if (row.result_kind === "PARTIAL") return "Giao thiếu";
    if (row.result_kind === "FAILED") return "Không giao được";
    if (row.state === "ASSIGNED") return "Chờ lấy hàng lên xe";
    if (row.state === "DISPATCHED" || row.state === "ARRIVED") return "Đang giao";
    if (row.state === "RESULT_SUBMITTED") return "Đã báo giao";
    return "Đã giao xong";
  }
  if (row.state === "CLAIMED") return "Đã nhận việc";
  if (row.state === "IN_PROGRESS" || row.state === "BLOCKED") return "Đang làm";
  return "Đã làm xong";
}

export type GivenTone = "open" | "locked" | "ok" | "warn";
export function givenTone(row: FieldDispatchGiven): GivenTone {
  if (row.result_kind === "PARTIAL" || row.result_kind === "FAILED") return "warn";
  if (row.can_change) return "open";
  if (["DISPATCHED", "ARRIVED", "IN_PROGRESS", "BLOCKED"].includes(row.state)) return "locked";
  return "ok";
}

export function isShort(row: Pick<FieldDispatchGiven, "result_kind">) {
  return row.result_kind === "PARTIAL" || row.result_kind === "FAILED";
}

/** The chip on a row the lead gave or moved himself. */
export function freshLabel(row: FieldDispatchGiven) {
  if (!row.field) return null;
  if (!row.field.by_me) return row.field.by_name ? `${row.field.by_name} giao` : null;
  if (row.field.action === "field_claimed") return "Bạn tự nhận";
  if (row.field.action === "field_reassigned") return "Bạn vừa đổi người";
  return "Bạn vừa giao";
}

export type WorkerChoice = {
  worker: FieldDispatchWorker;
  /** When this person could start it (earliest truck for a delivery); null when no truck / time is open to him. */
  startAt: string | null;
  jobsToday: number;
  suggested: boolean;
  /** Why the person cannot be chosen: declined it, already on it, no free truck. */
  blocked: string | null;
};

/**
 * "Chọn người khác": every branch worker, ordered as the concept says — the suggestion, then those on shift, then who is free
 * soonest, then who has fewest jobs today; who declined the delivery (or already holds it) is listed last and cannot be picked.
 */
export function rankWorkers(job: FieldDispatchWaiting | null, board: Pick<FieldDispatchBoard, "workers" | "given">,
  options: { currentEmployeeId?: string | null; startFor?: (employeeId: string) => string | null; today?: string } = {}): WorkerChoice[] {
  const jobsToday = new Map<string, number>();
  for (const row of board.given) jobsToday.set(row.employee_id, (jobsToday.get(row.employee_id) ?? 0) + 1);
  const declined = new Map((job?.kind === "DELIVERY" ? job.declined ?? [] : []).map((item) => [item.employee_id, item]));
  const suggestion = job?.kind === "DELIVERY" ? job.suggestion?.employee_id ?? null : null;
  const startFor = options.startFor ?? ((employeeId: string) => {
    if (!job) return null;
    if (job.kind === "SERVICE_JOB") return (job.candidates ?? []).find((item) => item.employee_id === employeeId)?.start_at ?? null;
    const times = (job.pairs ?? []).filter((pair) => pair.employee_id === employeeId).map((pair) => pair.start_at).sort();
    return times[0] ?? null;
  });
  const choices = board.workers.map<WorkerChoice>((worker) => {
    const refusal = declined.get(worker.id);
    const startAt = startFor(worker.id);
    const blocked = refusal ? `Đã từ chối phiếu này lúc ${fieldTime(refusal.at, options.today)}`
      : options.currentEmployeeId === worker.id ? "Đang nhận việc này"
      : !startAt ? "Chưa có xe hoặc giờ rảnh cho việc này" : null;
    return { worker, startAt, jobsToday: jobsToday.get(worker.id) ?? 0, suggested: worker.id === suggestion && !blocked, blocked };
  });
  const rank = (choice: WorkerChoice) => [choice.blocked ? 1 : 0, choice.suggested ? 0 : 1, choice.worker.clocked_in_at ? 0 : 1,
    choice.startAt ? new Date(choice.startAt).getTime() : Number.MAX_SAFE_INTEGER, choice.jobsToday] as const;
  return choices.sort((left, right) => {
    const a = rank(left);
    const b = rank(right);
    for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
    return left.worker.name.localeCompare(right.worker.name, "vi");
  });
}

/** Trucks free for this worker on this delivery, soonest first, the suggested one flagged. */
export function vehicleChoices(job: { pairs?: FieldDispatchPair[]; suggestion?: FieldDispatchPair | null },
  employeeId: string, vehicles: FieldDispatchBoard["vehicles"]) {
  const byId = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  return (job.pairs ?? []).filter((pair) => pair.employee_id === employeeId && byId.has(pair.vehicle_id))
    .sort((left, right) => left.start_at.localeCompare(right.start_at) || (byId.get(left.vehicle_id)!.code).localeCompare(byId.get(right.vehicle_id)!.code, "vi"))
    .map((pair) => ({ pair, vehicle: byId.get(pair.vehicle_id)!,
      suggested: job.suggestion?.employee_id === employeeId && job.suggestion.vehicle_id === pair.vehicle_id }));
}

/** Why the suggestion picked that worker and truck. */
export function suggestionReason(pair: FieldDispatchPair, vehicleCode: string) {
  return [pair.from_proposal ? "Gợi ý điều phối của văn phòng" : null, pair.default_driver ? `Tài xế mặc định của ${vehicleCode}` : null,
    pair.same_site ? "cùng công trình trong ngày" : null, (pair.day_count ?? 0) === 0 ? "chưa có phiếu khác trong ngày" : `${pair.day_count} phiếu khác trong ngày`]
    .filter(Boolean).join(" · ");
}

/** The "Điều phối hôm nay" line on Hôm nay. */
export function summaryLine(summary: FieldDispatchSummary) {
  const waiting = summary.waiting ? `${summary.waiting} việc chờ người` : "Không còn việc chờ người";
  const given = summary.given ? `${summary.given} việc đã giao cho ${summary.given_workers} người` : "chưa giao việc nào hôm nay";
  return `${waiting} · ${given}`;
}
