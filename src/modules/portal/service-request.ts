// D75: "Đặt dịch vụ" on the customer portal — what the database returns (customer_portal_service_*), how it is worded for the
// customer, the estimate shown before sending and the tracking steps. Everything here is display; the database decides.
import Decimal from "decimal.js";

import { BUSINESS_TIME_ZONE } from "@/lib/core/business-time";
import { isExactEntryQuantity, formatQuantity } from "@/lib/core/quantity";

export type ServiceSlot = "MORNING" | "AFTERNOON" | "TIME";

/** Where a request stands for the customer: the request itself first, then the service job it was turned into. */
export type ServiceRequestStage = "SUBMITTED" | "SCHEDULED" | "IN_PROGRESS" | "CONFIRMING" | "DONE" | "SCHEDULE_CANCELLED" | "CANCELLED" | "REJECTED";

export type CustomerServiceRequest = {
  id: string;
  number: string;
  /** The viewer's role on the account: only the owner cancels or orders again. */
  member_role: "OWNER" | "FINANCE_CONTACT" | "RECEIVER";
  state: "SUBMITTED" | "SCHEDULED" | "CANCELLED" | "REJECTED";
  stage: ServiceRequestStage;
  service_name: string;
  unit_label: string;
  quantity: string;
  site_name: string;
  site_address: string;
  /** Business date "YYYY-MM-DD". */
  preferred_date: string;
  preferred_slot: ServiceSlot;
  /** "HH:MM" when the customer asked for a specific time. */
  preferred_time?: string;
  contact_name: string;
  contact_phone: string;
  note?: string;
  submitted_at: string;
  scheduled_at?: string;
  scheduled_start?: string;
  started_at?: string;
  result_at?: string;
  verified_at?: string;
  /** Why the customer cancelled or the store did not take it. */
  decision_reason?: string;
  can_cancel: boolean;
  /** Money: only the owner and the finance contact receive these. */
  unit_price_vnd?: string;
  estimate_vnd?: string;
  billable_quantity?: string;
  final_amount_vnd?: string;
};

export type CustomerServiceRequests = { customer_id: string; membership_role: "OWNER" | "FINANCE_CONTACT" | "RECEIVER"; requests: CustomerServiceRequest[] };

export type PortalServiceOption = { id: string; unit_label: string; unit_price_vnd?: string | null };
export type PortalServiceCatalog = {
  customer: { id: string; code: string; display_name: string };
  contact: { name?: string; phone?: string };
  sites: { id: string; name: string; address_text: string; receiver_name: string | null; receiver_phone: string | null }[];
  groups: { name: string; services: { name: string; options: PortalServiceOption[] }[] }[];
};

const STAGE_LABELS: Record<ServiceRequestStage, string> = {
  SUBMITTED: "Chờ xác nhận", SCHEDULED: "Đã xếp lịch", IN_PROGRESS: "Đang thực hiện", CONFIRMING: "Chờ xác nhận khối lượng", DONE: "Hoàn tất",
  SCHEDULE_CANCELLED: "Cửa hàng đã hủy lịch", CANCELLED: "Đã hủy", REJECTED: "Cửa hàng chưa nhận",
};
export function serviceStageLabel(stage?: string | null) {
  return stage && Object.hasOwn(STAGE_LABELS, stage) ? STAGE_LABELS[stage as ServiceRequestStage] : "Đang cập nhật";
}

/** Colour of the stage chip: waiting (warm), finished (done), stopped, or in progress (default). */
export function serviceStageTone(stage: ServiceRequestStage): "warm" | "done" | "stopped" | "active" {
  if (stage === "SUBMITTED") return "warm";
  if (stage === "DONE") return "done";
  if (stage === "CANCELLED" || stage === "REJECTED" || stage === "SCHEDULE_CANCELLED") return "stopped";
  return "active";
}

/** Requests that still need the customer's attention (the "Đang xử lý" filter). */
export const isOpenStage = (stage: ServiceRequestStage) => stage === "SUBMITTED" || stage === "SCHEDULED" || stage === "IN_PROGRESS" || stage === "CONFIRMING";
export const isDoneStage = (stage: ServiceRequestStage) => stage === "DONE";

export const SLOT_OPTIONS: { value: ServiceSlot; label: string; hint: string }[] = [
  { value: "MORNING", label: "Sáng", hint: "7–11h" },
  { value: "AFTERNOON", label: "Chiều", hint: "13–17h" },
  { value: "TIME", label: "Giờ cụ thể", hint: "" },
];

/** "15/11" from a business date; no time zone shift because it is a calendar date, not an instant. */
export function shortDate(date: string) {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(date);
  return match ? `${match[2]}/${match[1]}` : date;
}

export function slotText(slot: ServiceSlot, time?: string | null) {
  if (slot === "MORNING") return "buổi sáng";
  if (slot === "AFTERNOON") return "buổi chiều";
  return time ? `lúc ${time}` : "giờ cụ thể";
}

/** "Mong muốn 15/11, buổi sáng". */
export function wishText(request: Pick<CustomerServiceRequest, "preferred_date" | "preferred_slot" | "preferred_time">) {
  return `Mong muốn ${shortDate(request.preferred_date)}, ${slotText(request.preferred_slot, request.preferred_time)}`;
}

/** "2 xe cn to" — the quantity with its unit. */
export const quantityText = (quantity: string, unit: string) => `${formatQuantity(quantity)} ${unit}`;

/** "Chạc gạch · 2 xe cn to". */
export const requestTitle = (request: Pick<CustomerServiceRequest, "service_name" | "quantity" | "unit_label">) =>
  `${request.service_name} · ${quantityText(request.quantity, request.unit_label)}`;

/** A wish may be this many days ahead (the database refuses more). */
export const SERVICE_WINDOW_DAYS = 120;
const businessDay = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
/** Today's business date "YYYY-MM-DD" (Asia/Ho_Chi_Minh, whatever the device's time zone). */
export const businessToday = (now: Date = new Date()) => businessDay.format(now);
/** A business date some days later (or earlier). */
export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const clock = new Intl.DateTimeFormat("vi-VN", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayMonthParts = new Intl.DateTimeFormat("vi-VN", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit" });
/** "14/11" whatever separator the locale data uses. */
const dayMonth = { format(date: Date) { const parts = dayMonthParts.formatToParts(date); const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ""; return `${part("day")}/${part("month")}`; } };
/** "17:20 · 14/11" for an instant, in business time. */
export function stampText(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? `${clock.format(date)} · ${dayMonth.format(date)}` : "";
}
/** "16/11 lúc 07:30". */
export function scheduleText(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? `${dayMonth.format(date)} lúc ${clock.format(date)}` : "";
}

/** Estimate: quantity × the unit price of the chosen option, rounded half up to whole đồng (as the database does). No price, no estimate. */
export function estimateVnd(quantity: string, unitPriceVnd?: string | null): bigint | null {
  if (!unitPriceVnd || !/^\d+$/.test(unitPriceVnd) || !isExactEntryQuantity(quantity)) return null;
  return BigInt(new Decimal(quantity).mul(unitPriceVnd).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

export type FlatService = { group: string; name: string; options: PortalServiceOption[] };
export const flatServices = (catalog: Pick<PortalServiceCatalog, "groups">): FlatService[] =>
  catalog.groups.flatMap((group) => group.services.map((service) => ({ group: group.name, name: service.name, options: service.options })));

/** Search the catalog by service or group name; accents and capitals do not matter ("chac gach"). */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN");
export function filterServices(catalog: Pick<PortalServiceCatalog, "groups">, query: string): PortalServiceCatalog["groups"] {
  const needle = fold(query.trim());
  if (!needle) return catalog.groups;
  return catalog.groups
    .map((group) => ({ ...group, services: group.services.filter((service) => fold(`${group.name} ${service.name}`).includes(needle)) }))
    .filter((group) => group.services.length > 0);
}

/** "Đặt lại": the catalog entry that matches an earlier request by name and unit (the unit falls back to the first option). */
export function matchReorder(catalog: Pick<PortalServiceCatalog, "groups">, request: Pick<CustomerServiceRequest, "service_name" | "unit_label">) {
  const same = (left: string, right: string) => fold(left.trim()) === fold(right.trim());
  const service = flatServices(catalog).find((entry) => same(entry.name, request.service_name));
  if (!service) return null;
  const option = service.options.find((entry) => same(entry.unit_label, request.unit_label)) ?? service.options[0];
  return option ? { service, option } : null;
}

/** Second line of a request in a list: the wish while it waits, the site afterwards. */
export function requestSubtitle(request: Pick<CustomerServiceRequest, "stage" | "site_name" | "preferred_date" | "preferred_slot" | "preferred_time">) {
  return request.stage === "SUBMITTED" ? `${wishText(request)} · ${request.site_name}` : request.site_name;
}

/**
 * Third line of a request in a list: when it was sent or scheduled and the money the customer may see (the estimate, or
 * "giá do cửa hàng báo"; the final amount once done). Receivers never get money fields, so none is shown to them.
 */
export function requestMeta(request: Pick<CustomerServiceRequest, "stage" | "submitted_at" | "scheduled_start" | "verified_at" | "estimate_vnd" | "final_amount_vnd" | "member_role" | "unit_price_vnd">,
  formatMoney: (value: string) => string) {
  const money = request.member_role !== "RECEIVER";
  if (request.stage === "DONE") {
    const day = request.verified_at ? dayMonth.format(new Date(request.verified_at)) : "";
    return [day, money && request.final_amount_vnd ? `Thành tiền ${formatMoney(request.final_amount_vnd)}` : null, money ? "đã ghi vào Công nợ" : null].filter(Boolean).join(" · ");
  }
  const price = !money || request.stage === "CANCELLED" || request.stage === "REJECTED" || request.stage === "SCHEDULE_CANCELLED" ? null
    : request.estimate_vnd ? `Tạm tính ${formatMoney(request.estimate_vnd)}` : "giá do cửa hàng báo";
  const when = request.stage === "SUBMITTED" || !request.scheduled_start || request.stage === "SCHEDULE_CANCELLED" ? `Gửi ${stampText(request.submitted_at)}` : scheduleText(request.scheduled_start);
  return [when, price].filter(Boolean).join(" · ");
}

export type ServiceStep = { key: string; label: string; state: "done" | "current" | "todo" | "stopped"; at?: string; hint?: string };

/**
 * The five steps of the concept (Đã gửi → Cửa hàng xác nhận lịch → Thợ thực hiện → Xác nhận khối lượng → Hoàn tất và ghi công nợ);
 * the first step not done is the current one. A request that stopped (cancelled, not taken, schedule cancelled) ends in one
 * "stopped" step that says why, instead of promising steps that will not happen.
 */
export function serviceRequestSteps(request: Pick<CustomerServiceRequest, "stage" | "submitted_at" | "scheduled_at" | "scheduled_start" | "started_at" | "result_at" | "verified_at" | "decision_reason">): ServiceStep[] {
  const sent: ServiceStep = { key: "sent", label: "Đã gửi yêu cầu", state: "done", at: request.submitted_at };
  const scheduledHint = request.scheduled_start ? `Lịch ${scheduleText(request.scheduled_start)}` : undefined;
  if (request.stage === "CANCELLED") return [sent, { key: "stopped", label: "Bạn đã hủy yêu cầu", state: "stopped", hint: request.decision_reason }];
  if (request.stage === "REJECTED") return [sent, { key: "stopped", label: "Cửa hàng chưa nhận yêu cầu này", state: "stopped",
    hint: request.decision_reason ? `Lý do: ${request.decision_reason}` : "Cửa hàng sẽ liên hệ nếu cần." }];
  if (request.stage === "SCHEDULE_CANCELLED") return [sent, { key: "scheduled", label: "Cửa hàng xác nhận lịch", state: "done", at: request.scheduled_at },
    { key: "stopped", label: "Cửa hàng đã hủy lịch", state: "stopped", hint: "Cửa hàng sẽ liên hệ để sắp xếp lại." }];
  const rank: Record<string, number> = { SUBMITTED: 1, SCHEDULED: 2, IN_PROGRESS: 2, CONFIRMING: 3, DONE: 5 };
  const doneUpTo = rank[request.stage] ?? 1;
  const steps: ServiceStep[] = [sent,
    { key: "scheduled", label: "Cửa hàng xác nhận lịch", state: "todo", at: request.scheduled_at,
      hint: doneUpTo >= 2 ? scheduledHint : "Đang chờ. Cửa hàng sẽ báo giờ, xe hoặc máy và thợ phụ trách." },
    { key: "working", label: "Thợ thực hiện", state: "todo", at: request.started_at,
      hint: request.stage === "IN_PROGRESS" ? "Thợ đang làm tại công trình." : doneUpTo >= 3 ? undefined : "Bạn thấy khi thợ bắt đầu làm." },
    { key: "confirming", label: "Xác nhận khối lượng", state: "todo", at: request.result_at, hint: "Cửa hàng đối chiếu số xe hoặc số giờ thực tế." },
    { key: "done", label: "Hoàn tất và ghi công nợ", state: "todo", at: request.verified_at, hint: "Số tiền cuối cùng hiện trong Công nợ." }];
  steps.forEach((step, index) => { if (index < doneUpTo) step.state = "done"; });
  const current = steps.findIndex((step) => step.state !== "done");
  if (current >= 0) steps[current].state = "current";
  return steps;
}
