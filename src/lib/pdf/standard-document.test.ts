// @vitest-environment node
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createStandardPdf, type StandardPdfInput } from "./standard-document";

const input: StandardPdfInput = {
  title: "PHIẾU THU", reference: "PT-0001", subtitle: "Đã ghi sổ / Chưa đối soát",
  fields: [{ label: "Đối tác", value: "Khách mẫu" }], columns: [{ label: "Nguồn", key: "source", width: 300 }, { label: "Số tiền", key: "amount", width: 211, align: "right" }],
  rows: [{ source: "Phải thu mẫu", amount: "1.000.000 VND" }], trace: "Nguồn: mẫu", disclaimer: "Chứng từ mẫu",
};

it("prints the company heading in the band and keeps the former name without a profile", async () => {
  expect((await PDFDocument.load(await createStandardPdf(input))).getAuthor()).toBe("Hiền Xa ERP");
  const doc = await PDFDocument.load(await createStandardPdf({ ...input, company: { name: "Công ty TNHH Hiền Xa", lines: ["Thôn Đông, Hà Nội", "MST: 0101234567", "STK: 0011001234567 · Vietcombank"] } }));
  expect(doc.getAuthor()).toBe("Công ty TNHH Hiền Xa");
  expect(doc.getPageCount()).toBe(1);
});
