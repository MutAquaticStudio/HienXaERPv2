/** A small table as CSV that Excel opens with Vietnamese text: comma-separated, every cell quoted, UTF-8 with BOM. */
export function toCsv(rows: Array<Record<string, string | number>>, headers: Array<[string, string]>) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return "﻿" + [headers.map(([, label]) => quote(label)).join(","), ...rows.map((row) => headers.map(([key]) => quote(row[key] ?? "")).join(","))].join("\r\n");
}
