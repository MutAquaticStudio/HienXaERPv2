import ExcelJS from "exceljs";
import { businessParts, plainQuantity, type ExportKind, type ExportTable, type ExportValue } from "./export-table";

const MONEY_FORMAT = '#,##0" ₫"';
const COUNT_FORMAT = "#,##0";
const WHOLE = /^-?\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

type Cell = { value: ExcelJS.CellValue; numFmt?: string };

/** One value as a real spreadsheet cell: money and quantities are numbers, days and times are dates shown in Vietnam time. */
export function excelCell(kind: ExportKind, value: ExportValue): Cell {
  if (value === null || value === "") return { value: null };
  if ((kind === "money" || kind === "number") && WHOLE.test(value)) {
    const number = Number(value);
    return Number.isSafeInteger(number) ? { value: number, numFmt: kind === "money" ? MONEY_FORMAT : COUNT_FORMAT } : { value };
  }
  if (kind === "quantity" && DECIMAL.test(value)) {
    const plain = plainQuantity(value);
    return { value: Number(plain), numFmt: plain.includes(".") ? `#,##0.${"#".repeat(Math.min(6, plain.split(".")[1].length))}` : COUNT_FORMAT };
  }
  if (kind === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return { value: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))), numFmt: "dd/mm/yyyy" };
  }
  if (kind === "datetime") {
    const parts = businessParts(value);
    // Spreadsheet dates have no time zone: write the Vietnam wall-clock time so every computer shows the same hour.
    if (parts) return { value: new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))), numFmt: "dd/mm/yyyy hh:mm" };
  }
  return { value };
}

function sheetName(name: string) {
  return name.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Báo cáo";
}

function width(kind: ExportKind, value: ExportValue) {
  if (value === null) return 0;
  if (kind === "money") return value.length + Math.floor(value.length / 3) + 3;
  if (kind === "datetime") return 17;
  if (kind === "date") return 11;
  return value.length;
}

/** D57: the Excel file — title block, headline figures, a frozen and filterable header, typed cells and a bold total row. */
export async function toReportXlsx(table: ExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hiền Xa ERP";
  workbook.created = new Date();
  const headerRow = 1 + table.meta.length + table.kpis.length + 2;
  const sheet = workbook.addWorksheet(sheetName(table.sheet), { views: [{ state: "frozen", ySplit: headerRow, showGridLines: true }] });

  const title = sheet.getRow(1);
  title.getCell(1).value = table.title;
  title.font = { bold: true, size: 14 };
  table.meta.forEach(([label, value], index) => {
    const row = sheet.getRow(2 + index);
    row.getCell(1).value = label;
    row.getCell(1).font = { color: { argb: "FF5B6573" } };
    row.getCell(2).value = value;
  });
  table.kpis.forEach((kpi, index) => {
    const row = sheet.getRow(2 + table.meta.length + index);
    row.getCell(1).value = kpi.label;
    row.getCell(1).font = { color: { argb: "FF5B6573" } };
    const cell = excelCell(kpi.kind, kpi.value);
    row.getCell(2).value = cell.value ?? "—";
    if (cell.numFmt) row.getCell(2).numFmt = cell.numFmt;
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { horizontal: "left" };
  });

  const header = sheet.getRow(headerRow);
  table.columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB8C2CF" } } };
    cell.alignment = { vertical: "middle", horizontal: column.kind === "text" ? "left" : "right", wrapText: true };
  });

  const write = (rowNumber: number, values: ExportValue[]) => {
    const row = sheet.getRow(rowNumber);
    table.columns.forEach((column, index) => {
      const cell = excelCell(column.kind, values[index] ?? null);
      const target = row.getCell(index + 1);
      target.value = cell.value;
      if (cell.numFmt) target.numFmt = cell.numFmt;
    });
    return row;
  };
  table.rows.forEach((values, index) => write(headerRow + 1 + index, values));
  if (table.totals) {
    const totals = write(headerRow + 1 + table.rows.length, table.totals);
    totals.font = { bold: true };
    table.columns.forEach((_, index) => { totals.getCell(index + 1).border = { top: { style: "thin", color: { argb: "FF5B6573" } } }; });
  }
  if (table.columns.length) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: table.columns.length } };

  table.columns.forEach((column, index) => {
    const longest = Math.max(column.label.length, ...table.rows.map((row) => width(column.kind, row[index] ?? null)), table.totals ? width(column.kind, table.totals[index] ?? null) : 0);
    sheet.getColumn(index + 1).width = Math.min(48, Math.max(index === 0 ? 18 : 10, longest + 2));
  });
  // The title block's labels live in column A; keep them readable even when the first table column is narrow.
  const metaWidth = Math.max(...[...table.meta.map(([label]) => label), ...table.kpis.map((kpi) => kpi.label)].map((label) => label.length + 2), 0);
  if (metaWidth > (sheet.getColumn(1).width ?? 0)) sheet.getColumn(1).width = Math.min(36, metaWidth);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
