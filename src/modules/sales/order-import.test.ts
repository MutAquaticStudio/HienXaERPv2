// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildOrderTemplate, importDate, ORDER_COLUMNS, ORDER_SHEET, parseOrderWorkbook } from "./order-import";

const reference = {
  customers: [{ code: "KH01", name: "Công ty An Phát", sites: [{ code: "CT1", name: "Nhà xưởng Q.7" }] }],
  materials: [{ code: "XM01", name: "Xi măng Hà Tiên", units: ["bao", "tấn"] }, { code: "CAT01", name: "Cát vàng", units: ["m³"] }],
};

async function workbook(rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(ORDER_SHEET);
  sheet.addRow([...ORDER_COLUMNS]);
  for (const row of rows) sheet.addRow(row);
  return (await book.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("Nhập đơn bán từ Excel (D37)", () => {
  it("builds a template with the example order and the codes to copy, and reads it back", async () => {
    const file = await buildOrderTemplate(reference);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(file);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([ORDER_SHEET, "Hướng dẫn", "Khách hàng", "Hàng hóa"]);
    expect(book.getWorksheet("Hàng hóa")!.getRow(2).values).toEqual([, "XM01", "Xi măng Hà Tiên", "bao, tấn"]);
    const parsed = await parseOrderWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].rows.map((row) => [row.customerCode, row.siteCode, row.materialCode, row.unit, row.quantity])).toEqual([["KH01", "CT1", "XM01", "bao", "10"], ["KH01", "CT1", "CAT01", "m³", "5"]]);
  });

  it("groups rows by Nhóm đơn and reports bad cells per order", async () => {
    const parsed = await parseOrderWorkbook(await workbook([
      ["A", "kh01", "", "05/11/2026", "xm01", "bao", 20, "", "Giao sáng"],
      ["A", "KH01", "", "05/11/2026", "CAT01", "", "1,5", "", ""],
      ["B", "KH02", "", "31/02/x", "XM01", "", 0, "12,5", ""],
      ["B", "KH03", "", "", "XM01", "", 3, "", ""],
      [],
    ]));
    expect(parsed.problems).toEqual([]);
    const [a, b] = parsed.groups;
    expect(a.problems).toEqual([]);
    expect(a.rows.map((row) => [row.customerCode, row.deliveryDate, row.materialCode, row.quantity, row.note])).toEqual([
      ["KH01", "2026-11-05", "XM01", "20", "Giao sáng"], ["KH01", "2026-11-05", "CAT01", "1.5", ""]]);
    expect(b.problems).toEqual([
      "Dòng 4: số lượng không hợp lệ.", "Dòng 4: đơn giá phải là số tiền nguyên.", "Dòng 4: ngày giao không đúng dạng dd/mm/yyyy.",
      "Dòng 5: cùng nhóm đơn \"B\" nhưng khác khách hàng, công trình hoặc ngày giao.",
    ]);
  });

  it("reads Excel dates and Vietnamese dates, and refuses a file that is not Excel", async () => {
    expect(importDate(new Date("2026-11-05T00:00:00Z"))).toBe("2026-11-05");
    expect(importDate("5/11/2026")).toBe("2026-11-05");
    expect(importDate("")).toBeNull();
    expect((await parseOrderWorkbook(new TextEncoder().encode("không phải excel").buffer as ArrayBuffer)).problems[0]).toMatch(/Không đọc được file/);
  });
});
