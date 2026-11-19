// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { asciiFileName, attachmentHeader, plainQuantity, reportFileBase, safeText, sumValues, toReportCsv, type ExportTable } from "./export-table";
import { excelCell, toReportXlsx } from "./export-xlsx";
import { financeExportTable } from "./finance-table";

const table: ExportTable = {
  title: "Hàng hóa · Xuất nhập tồn",
  sheet: "Xuất nhập tồn",
  meta: [["Kỳ", "01/10/2026 – 04/11/2026"], ["Kho", "Kho chính"]],
  kpis: [{ label: "Giá trị tồn cuối kỳ", kind: "money", value: "62071800" }],
  columns: [{ label: "Hàng hóa", kind: "text" }, { label: "ĐVT", kind: "text" }, { label: "Tồn cuối", kind: "quantity" }, { label: "Giá trị tồn", kind: "money" },
    { label: "Ngày", kind: "date" }, { label: "Lúc", kind: "datetime" }],
  rows: [["Xi măng PCB40", "kg", "20048.000000", "32071800", "2026-11-02", "2026-11-02T05:01:00Z"], ["Cát vàng", "m³", "1.125000", null, null, null]],
  totals: ["Tổng cộng", null, null, "32071800", null, null],
  fileBase: "Xuất nhập tồn 01-10-2026 đến 04-11-2026",
};

describe("report files (D57)", () => {
  it("keeps quantities exact without the database padding", () => {
    expect(plainQuantity("20048.000000")).toBe("20048");
    expect(plainQuantity("1.125000")).toBe("1.125");
    expect(plainQuantity("abc")).toBe("abc");
  });

  it("adds whole money exactly and refuses to add what is not a number", () => {
    expect(sumValues("money", ["9007199254740993", "1", null])).toBe("9007199254740994");
    expect(sumValues("quantity", ["0.1", "0.2"])).toBe("0.3");
    expect(sumValues("money", [null, ""])).toBeNull();
    expect(sumValues("text", ["a"])).toBeNull();
  });

  it("stops text from running as a spreadsheet formula, but leaves numbers alone", () => {
    expect(safeText("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeText("-Khách lẻ")).toBe("'-Khách lẻ");
    expect(safeText("Xi măng")).toBe("Xi măng");
    expect(toReportCsv({ ...table, rows: [["-1", "kg", "-2.5", "-250000", null, null]], totals: null })).toContain("\"'-1\",\"kg\",-2.5,-250000,,");
  });

  it("writes a CSV with the title block, Vietnamese headers, plain numbers and the total row", () => {
    const lines = toReportCsv(table).split("\r\n");
    expect(lines[0]).toBe("﻿\"Báo cáo\",\"Hàng hóa · Xuất nhập tồn\"");
    expect(lines.slice(1, 5)).toEqual(["\"Kỳ\",\"01/10/2026 – 04/11/2026\"", "\"Kho\",\"Kho chính\"", "\"Giá trị tồn cuối kỳ\",62071800", ""]);
    expect(lines[5]).toBe("\"Hàng hóa\",\"ĐVT\",\"Tồn cuối\",\"Giá trị tồn\",\"Ngày\",\"Lúc\"");
    // Vietnam time, whatever the server's time zone.
    expect(lines[6]).toBe("\"Xi măng PCB40\",\"kg\",20048,32071800,\"2026-11-02\",2026-11-02 12:01");
    expect(lines[7]).toBe("\"Cát vàng\",\"m³\",1.125,,,");
    expect(lines[8]).toBe("\"Tổng cộng\",,,32071800,,");
  });

  it("names the file in Vietnamese, with an ASCII copy for old browsers", () => {
    expect(reportFileBase("Hàng hóa · Xuất nhập tồn", "2026-10-01", "2026-11-04")).toBe("Hàng hóa - Xuất nhập tồn 01-10-2026 đến 04-11-2026");
    expect(reportFileBase("Cuối ngày", "2026-11-04", "2026-11-04")).toBe("Cuối ngày 04-11-2026");
    expect(asciiFileName("Đối soát công nợ 04-11-2026")).toBe("Doi-soat-cong-no-04-11-2026");
    expect(attachmentHeader("Cuối ngày 04-11-2026", "xlsx")).toBe(`attachment; filename="Cuoi-ngay-04-11-2026.xlsx"; filename*=UTF-8''${encodeURIComponent("Cuối ngày 04-11-2026.xlsx")}`);
  });

  it("writes typed Excel cells: numbers, Vietnam-time dates, a frozen filterable header and a bold total", async () => {
    expect(excelCell("money", "-253200")).toEqual({ value: -253200, numFmt: '#,##0" ₫"' });
    expect(excelCell("quantity", "1.125000")).toEqual({ value: 1.125, numFmt: "#,##0.###" });
    expect(excelCell("money", "12345678901234567890")).toEqual({ value: "12345678901234567890" });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await toReportXlsx(table) as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet("Xuất nhập tồn")!;
    expect(sheet.getCell("A1").value).toBe("Hàng hóa · Xuất nhập tồn");
    expect(sheet.getCell("B4").value).toBe(62071800);
    expect(sheet.getRow(6).values).toEqual([undefined, "Hàng hóa", "ĐVT", "Tồn cuối", "Giá trị tồn", "Ngày", "Lúc"]);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 6 });
    expect(sheet.getCell("C7").value).toBe(20048);
    expect(sheet.getCell("D7").numFmt).toBe('#,##0" ₫"');
    expect((sheet.getCell("E7").value as Date).toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect((sheet.getCell("F7").value as Date).toISOString()).toBe("2026-11-02T12:01:00.000Z");
    expect(sheet.getCell("C8").value).toBe(1.125);
    expect(sheet.getCell("A9").value).toBe("Tổng cộng");
    expect(sheet.getCell("D9").value).toBe(32071800);
    expect(sheet.getRow(9).font?.bold).toBe(true);
  });

  it("exports a finance report with Vietnamese columns and no internal ids", () => {
    const report = { title: "Phải thu còn mở", totalLabel: "Tổng phải thu", totalVnd: "7500000", quality: "READY", scopeText: "Số dư đến hết 04/11/2026" };
    const rows = [{ id: "9d1d3f14-7537-4e04-9f47-1fe77b139950", label: "Công ty An Phát", context: "Nhà xưởng · Đơn bán", date: "2026-11-20", amountVnd: "5000000" },
      { id: "obligation-2", label: "Anh Tư", context: "", date: "2026-11-02", amountVnd: "2500000" }];
    const exported = financeExportTable("receivables", report, rows, { from: "2026-11-01", to: "2026-11-04", branchName: "Chi nhánh chính", now: new Date("2026-11-04T07:00:00Z") });
    const csv = toReportCsv(exported);
    expect(csv).toContain("\"Khách hàng\",\"Công trình / chứng từ\",\"Hạn thanh toán\",\"Còn phải thu\"");
    expect(csv).toContain("\"Công ty An Phát\",\"Nhà xưởng · Đơn bán\",\"2026-11-20\",5000000");
    expect(csv).toContain("\"Tổng cộng\",,,7500000");
    expect(csv).not.toMatch(/9d1d3f14|READY|amount_vnd/);
    expect(exported.fileBase).toBe("Phải thu chi tiết 04-11-2026");
  });
});
