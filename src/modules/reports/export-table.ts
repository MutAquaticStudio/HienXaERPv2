import Decimal from "decimal.js";
import { BUSINESS_TIME_ZONE } from "@/lib/core/business-time";

/**
 * D57: one table shape for every report file (Excel and CSV): a title block (report, kỳ, kho, chi nhánh, giờ xuất),
 * the headline figures, the table with a "Tổng cộng" row, typed cells so money and quantities stay numbers.
 * Values are canonical strings: money and counts as whole numbers, quantities as decimals with ".", dates as
 * "YYYY-MM-DD", times as ISO instants; text as shown on screen.
 */
export type ExportKind = "text" | "money" | "quantity" | "number" | "date" | "datetime";
export type ExportColumn = { label: string; kind: ExportKind };
export type ExportValue = string | null;
export type ExportTable = {
  title: string;
  sheet: string;
  meta: Array<[string, string]>;
  kpis: Array<{ label: string; kind: "money" | "number"; value: string | null }>;
  columns: ExportColumn[];
  rows: ExportValue[][];
  totals: ExportValue[] | null;
  fileBase: string;
};

const WHOLE = /^-?\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

/** "100.000000" → "100", "12.500" → "12.5": database scale padding is dropped, the value is never rounded. */
export function plainQuantity(value: string) {
  return DECIMAL.test(value) ? new Decimal(value).toFixed() : value;
}

/** dd/mm/yyyy of a "YYYY-MM-DD" business day. */
export function dayText(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

export function periodText(from: string | undefined, to: string) {
  return from && from !== to ? `${dayText(from)} – ${dayText(to)}` : dayText(to);
}

/** The business-time parts of an instant, for files that must show Vietnam time whatever the reader's computer says. */
export function businessParts(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

export function exportedAtText(now: Date) {
  const parts = businessParts(now);
  return parts ? `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}` : "";
}

/** Sum of one column: money and counts as whole numbers; quantities exactly. Null when nothing can be added. */
export function sumValues(kind: ExportKind, values: ExportValue[]): string | null {
  const present = values.filter((value): value is string => value !== null && value !== "");
  if (!present.length) return null;
  if (kind === "money" || kind === "number") {
    if (!present.every((value) => WHOLE.test(value))) return null;
    return present.reduce((total, value) => total + BigInt(value), 0n).toString();
  }
  if (kind === "quantity") {
    if (!present.every((value) => DECIMAL.test(value))) return null;
    return present.reduce((total, value) => total.plus(value), new Decimal(0)).toFixed();
  }
  return null;
}

/** A spreadsheet opens "=…", "+…", "-…", "@…" text as a formula: such text gets a leading apostrophe. Numbers stay numbers. */
export function safeText(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(kind: ExportKind, value: ExportValue) {
  if (value === null || value === "") return "";
  if ((kind === "money" || kind === "number") && WHOLE.test(value)) return value;
  if (kind === "quantity" && DECIMAL.test(value)) return plainQuantity(value);
  if (kind === "datetime") {
    const parts = businessParts(value);
    if (parts) return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  }
  return `"${safeText(value).replaceAll('"', '""')}"`;
}

const textCell = (value: string) => `"${safeText(value).replaceAll('"', '""')}"`;

/**
 * CSV for other software and for checking by hand: UTF-8 with BOM, comma-separated, CRLF, text quoted.
 * Numbers carry no thousands separator; quantities use "." for decimals; dates are YYYY-MM-DD. To open in Excel,
 * the Excel file is the one to use.
 */
export function toReportCsv(table: ExportTable) {
  const lines: string[] = [
    [textCell("Báo cáo"), textCell(table.title)].join(","),
    ...table.meta.map(([label, value]) => [textCell(label), textCell(value)].join(",")),
    ...table.kpis.map((kpi) => [textCell(kpi.label), csvCell(kpi.kind, kpi.value)].join(",")),
    "",
    table.columns.map((column) => textCell(column.label)).join(","),
    ...table.rows.map((row) => table.columns.map((column, index) => csvCell(column.kind, row[index] ?? null)).join(",")),
  ];
  if (table.totals) lines.push(table.columns.map((column, index) => index === 0 ? textCell(table.totals?.[0] ?? "Tổng cộng") : csvCell(column.kind, table.totals?.[index] ?? null)).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "Xuất nhập tồn 01-10-2026 đến 04-11-2026" — the readable name; the header also carries an ASCII copy for old browsers. */
export function reportFileBase(name: string, from: string | undefined, to: string) {
  const day = (value: string) => dayText(value).replaceAll("/", "-");
  return `${name.replace(/\s*·\s*/g, " - ")} ${from && from !== to ? `${day(from)} đến ${day(to)}` : day(to)}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

export function asciiFileName(base: string) {
  return base.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, (letter) => letter === "đ" ? "d" : "D")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "bao-cao";
}

export function attachmentHeader(base: string, extension: "csv" | "xlsx") {
  return `attachment; filename="${asciiFileName(base)}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${base}.${extension}`)}`;
}

export const EXPORT_CONTENT_TYPE = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export type ExportFormat = keyof typeof EXPORT_CONTENT_TYPE;
export function exportFormat(value: string | null): ExportFormat { return value === "xlsx" ? "xlsx" : "csv"; }
