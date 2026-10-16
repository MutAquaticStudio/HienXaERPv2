// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createBusinessDocument, wrapDocumentText, type BusinessDocumentInput } from "./business-document";
const input: BusinessDocumentInput = { title: "ĐƠN BÁN HÀNG", reference: "SO-MAU", branch: "Chi nhánh mẫu", status: "MẪU MINH HỌA", fields: [{ label: "Khách", value: "Khách mẫu" }], columns: [{ label: "Vật tư", key: "material", width: 300 }, { label: "Số lượng", key: "quantity", width: 100 }], rows: [{ material: "Xi măng", quantity: "0,123456" }], notes: [{ title: "Điều khoản", text: "Điều khoản mẫu" }], signatures: ["Người lập", "Khách hàng"], generatedAt: "14/10/2026 09:00", sourceId: "MẪU-KHÔNG-GHI-SỔ" };
describe("A4 business PDF", () => {
  it("embeds a Vietnamese font and fits a short complete document on A4", async () => {
    const doc = await PDFDocument.load(await createBusinessDocument(input));
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain("SO-MAU");
    expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28);
  });
  it("paginates long tables, long individual rows, fields and multiline notes", async () => {
    const doc = await PDFDocument.load(await createBusinessDocument({ ...input, fields: [{ label: "Địa chỉ", value: "Địa chỉ dài ".repeat(900) }], rows: Array.from({ length: 80 }, (_, i) => ({ material: `${i + 1} ` + "Vật tư có quy cách ".repeat(i === 2 ? 900 : 2), quantity: "123,456789" })), notes: [{ title: "Điều khoản", text: "Giao nhiều đợt.\n".repeat(100) }] }));
    expect(doc.getPageCount()).toBeGreaterThan(10);
  // Lays out and subsets the font for 10+ pages: ~4 s on a 4-core machine, too close to the 5 s default.
  }, 20000);
  it("wraps long unbroken references without losing characters and preserves paragraphs", () => {
    const font = { widthOfTextAtSize: (s: string) => s.length * 5 };
    const token = "0123456789".repeat(20);
    const result = wrapDocumentText(font, token + "\nDòng thứ hai", 9, 80);
    expect(result.slice(0, -1).join("")).toBe(token);
    expect(result.at(-1)).toBe("Dòng thứ hai");
    expect(result.every(s => font.widthOfTextAtSize(s) <= 80)).toBe(true);
  });
});
