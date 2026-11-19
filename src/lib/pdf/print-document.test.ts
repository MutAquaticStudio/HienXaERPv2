// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createPrintDocument, type PrintDocumentInput } from "./print-document";

const base: PrintDocumentInput = { paper: "A4", title: "ĐƠN BÁN HÀNG", reference: "SO-1", issuedAt: "Ngày 03/11/2026", company: { name: "Hiền Xa", lines: ["Đại Mỗ"] },
  info: [{ label: "Khách hàng", value: "An Phát" }], columns: [{ label: "Tên hàng", key: "name", width: 1 }],
  rows: Array.from({ length: 3 }, (_, i) => ({ name: `Hàng ${i + 1}` })), items: [{ name: "Xi măng", quantity: "1", unit: "bao", amount: "100.000" }],
  totals: [{ label: "Tổng", value: "100.000 ₫", strong: true }], signatures: ["Khách hàng", "Người lập phiếu"], thanks: "Cảm ơn quý khách!" };

describe("D52 print layout", () => {
  it("prints A4, A5 landscape and an 80 mm roll cut to its content", async () => {
    const sizes = async (input: PrintDocumentInput) => (await PDFDocument.load(await createPrintDocument(input))).getPages().map((page) => page.getMediaBox());
    expect((await sizes(base))[0]).toMatchObject({ width: 595.28, height: 841.89 });
    expect((await sizes({ ...base, paper: "A5" }))[0]).toMatchObject({ width: 595.28, height: 419.53 });
    const roll = (await sizes({ ...base, paper: "K80" }))[0];
    expect(roll.width).toBeCloseTo(226.77, 1);
    expect(roll.height).toBeGreaterThan(150);
    expect(roll.height).toBeLessThan(700);
  });

  it("continues a long table on the next page and still prints when the QR image cannot be read", async () => {
    const long = { ...base, rows: Array.from({ length: 80 }, (_, i) => ({ name: `Hàng ${i + 1}` })), qr: { image: new Uint8Array([1, 2, 3]), caption: ["Vietcombank · 0123"] } };
    const pdf = await PDFDocument.load(await createPrintDocument(long));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
