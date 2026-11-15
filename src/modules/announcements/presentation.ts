import { z } from "zod";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";

/** D83 "Thông báo cập nhật": where an announcement shows (the portal), what made it and how the owner labelled it. */
export type AnnouncementSurface = "CUSTOMER" | "WORKER" | "OFFICE";
export type AnnouncementLabel = "NEWS" | "FEATURE" | "RULE";

const digits = z.string().regex(/^\d{1,19}$/);
const lineSchema = z.object({
  code: z.string().nullish(),
  name: z.string(),
  unit: z.string().nullish(),
  old: digits.nullish(),
  old_kind: z.enum(["VND", "BPS"]).nullish(),
  new: digits.nullish(),
  new_kind: z.enum(["VND", "BPS"]).nullish(),
});
const announcementSchema = z.object({
  id: z.guid(),
  audience: z.enum(["CUSTOMER", "WORKER", "OFFICE"]),
  kind: z.enum(["PRICE", "PAY_RATE", "MANUAL"]),
  label: z.enum(["NEWS", "FEATURE", "RULE"]).nullish(),
  title: z.string(),
  body: z.string().nullish(),
  link: z.string().nullish(),
  effective_at: z.string().nullish(),
  created_at: z.string(),
  updated_at: z.string().nullish(),
  seen_at: z.string().nullish(),
  lines: z.array(lineSchema).default([]),
});
export type AnnouncementLine = z.infer<typeof lineSchema>;
export type Announcement = z.infer<typeof announcementSchema>;

/** The owner's "Đã gửi gần đây": one row per announcement, or per price save for the customers' announcements. */
export type SentAnnouncement = {
  group_id: string; audience: AnnouncementSurface; kind: "PRICE" | "PAY_RATE" | "MANUAL"; label: AnnouncementLabel | null;
  title: string; created_at: string; expires_at: string; withdrawn_at: string | null; announcements: number; recipients: number; seen: number;
};
/** How many accounts each choice of "Gửi tới" reaches, and the office roles of the branch. */
export type ComposerOptions = { customers: number; workers: number; office: number; roles: { id: string; name: string; count: number }[] };

/** What the database answered, or nothing when it is not a list of announcements. */
export function parseAnnouncements(raw: unknown): Announcement[] {
  const parsed = z.array(announcementSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export const LABEL_NAMES: Record<AnnouncementLabel, string> = { NEWS: "Tin từ cửa hàng", FEATURE: "Tính năng mới", RULE: "Quy định mới" };

/** The small capitalised chip above the title. */
export function chipOf(item: Pick<Announcement, "kind" | "label">): { text: string; tone: "price" | "pay" | "news" | "feature" | "rule" } {
  if (item.kind === "PRICE") return { text: "CẬP NHẬT GIÁ", tone: "price" };
  if (item.kind === "PAY_RATE") return { text: "ĐƠN GIÁ CÔNG", tone: "pay" };
  const label = item.label ?? "NEWS";
  return { text: LABEL_NAMES[label].toLocaleUpperCase("vi-VN"), tone: label === "FEATURE" ? "feature" : label === "RULE" ? "rule" : "news" };
}

/** Pages a composed announcement may open (the database allows the same list). */
export const LINK_OPTIONS: Record<AnnouncementSurface, readonly { value: string; label: string }[]> = {
  CUSTOMER: [
    { value: "/customer/orders/new", label: "Đặt hàng" },
    { value: "/customer/services/new", label: "Đặt dịch vụ" },
    { value: "/customer/orders", label: "Đơn hàng" },
    { value: "/customer/debts", label: "Công nợ" },
  ],
  WORKER: [
    { value: "/work/pool", label: "Nhận việc" },
    { value: "/work/earnings", label: "Thu nhập" },
    { value: "/work/attendance", label: "Chấm công" },
  ],
  OFFICE: [
    { value: "/admin/dispatch", label: "Điều phối" },
    { value: "/admin/products/pricing", label: "Giá bán" },
    { value: "/admin/orders", label: "Đơn bán" },
  ],
};

export function linkLabel(surface: AnnouncementSurface, link: string | null | undefined): string | null {
  return LINK_OPTIONS[surface].find((option) => option.value === link)?.label ?? null;
}

function percent(bps: bigint) {
  return `${(Number(bps) / 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}

/** A price or rate as people read it: "98.000 ₫", "5%". */
export function valueText(value: string | null | undefined, kind: "VND" | "BPS" | null | undefined): string {
  if (value == null) return "—";
  return kind === "BPS" ? percent(BigInt(value)) : formatVnd(vnd(value));
}

/** How one line changed, in words (never only a colour): "Tăng 3.000 ₫", "Giảm 0,5%", "Mới", "Ngừng áp dụng". */
export function lineChange(line: AnnouncementLine): { tone: "up" | "down" | "new" | "stopped" | "changed"; text: string } {
  if (line.old == null) return { tone: "new", text: "Mới" };
  if (line.new == null) return { tone: "stopped", text: "Ngừng áp dụng" };
  if ((line.old_kind ?? "VND") !== (line.new_kind ?? "VND")) return { tone: "changed", text: "Đổi cách tính" };
  const diff = BigInt(line.new) - BigInt(line.old);
  const amount = (line.new_kind ?? "VND") === "BPS" ? percent(diff < 0n ? -diff : diff) : formatVnd(vnd(diff < 0n ? -diff : diff));
  return diff > 0n ? { tone: "up", text: `Tăng ${amount}` } : { tone: "down", text: `Giảm ${amount}` };
}

/** Under the item name: "Bao" for a price, "mỗi Bao" / "trên tiền tính khách" for a pay rate. */
export function unitText(item: Pick<Announcement, "kind">, line: AnnouncementLine): string | null {
  if (item.kind !== "PAY_RATE") return line.unit ?? null;
  if ((line.new_kind ?? line.old_kind) === "BPS") return "trên tiền tính khách";
  return line.unit ? `mỗi ${line.unit}` : null;
}

export function shortDate(value: string) {
  return formatBusinessDate(value).slice(0, 5);
}

/** The sign-off line under a composed announcement, or when a pay change happened. */
export function signOff(item: Announcement): string {
  if (item.kind === "PAY_RATE") return `Đổi lúc ${formatBusinessDateTime(item.updated_at ?? item.created_at)}`;
  if (item.kind === "PRICE" && item.effective_at) return `Áp dụng từ ${formatBusinessDate(item.effective_at)}`;
  return `Cửa hàng Hiền Xa · ${formatBusinessDate(item.created_at)}`;
}

/** The passive line after saving prices: " Đã báo 3 khách có giá thay đổi." (nothing when nobody's price changed). */
export function reachSentence(reach: number | null): string {
  return reach && reach > 0 ? ` Đã báo ${reach} khách có giá thay đổi.` : "";
}
