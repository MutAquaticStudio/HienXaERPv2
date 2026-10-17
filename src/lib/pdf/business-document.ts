import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from "pdf-lib";
import { FALLBACK_COMPANY_NAME, type CompanyHeading } from "@/lib/company/profile";

export type DocumentField = { label: string; value: string };
export type BusinessDocumentInput = {
  title: string; reference: string; branch: string; status: string;
  fields: DocumentField[];
  columns: { label: string; key: string; width: number; align?: "right" }[];
  rows: Record<string, string>[];
  totals?: DocumentField[];
  notes: { title: string; text: string }[];
  signatures: string[];
  generatedAt: string;
  sourceId: string;
  sample?: boolean;
  /** Company details from Cài đặt (D10); without them the former fixed heading is printed. */
  company?: CompanyHeading;
};
const W = 595.28, H = 841.89, M = 42, CW = W - M * 2, BOTTOM = 80;
const ink = rgb(.08, .15, .24), blue = rgb(.025, .36, .72), muted = rgb(.35, .42, .5);
const pale = rgb(.94, .96, .985), border = rgb(.82, .86, .91);

// Preserve paragraphs and split long codes/URLs rather than clipping text.
export function wrapDocumentText(font: Pick<PDFFont, "widthOfTextAtSize">, text: string, size: number, width: number): string[] {
  const clean = text.normalize("NFC").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const lines: string[] = [];
  for (const paragraph of (clean || "-").split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? current + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
      if (current) lines.push(current);
      current = "";
      for (const char of word) {
        if (current && font.widthOfTextAtSize(current + char, size) > width) { lines.push(current); current = ""; }
        current += char;
      }
    }
    lines.push(current || " ");
  }
  return lines;
}

export async function createBusinessDocument(input: BusinessDocumentInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readFile(path.join(process.cwd(), "public/fonts/NotoSansVietnamese-Regular.ttf")), { subset: true });
  doc.setTitle(`${input.title} - ${input.reference}`);
  const company = input.company ?? { name: FALLBACK_COMPANY_NAME, lines: [] };
  doc.setAuthor(company.name); doc.setCreator("Hiền Xa ERP");
  const logo = await embedLogo(doc, company.logo);
  const logoSize = logo ? fitInside(logo, 96, 40) : { width: 0, height: 0 };
  const textLeft = M + (logo ? logoSize.width + 12 : 0);
  doc.setSubject(`Nguồn: ${input.sourceId}; xuất lúc: ${input.generatedAt}`);
  let page!: PDFPage;
  let y = 0;
  const draw = (text: string, x: number, baseline: number, size = 9, color = ink) => page.drawText(text, { x, y: baseline, size, font, color });
  const right = (text: string, x: number, baseline: number, size = 9) => draw(text, x - font.widthOfTextAtSize(text, size), baseline, size);
  const addPage = () => {
    page = doc.addPage([W, H]);
    if (logo) page.drawImage(logo, { x: M, y: H - 34 - logoSize.height, ...logoSize });
    const nameLines = wrapDocumentText(font, company.name, 12, CW - 150 - (textLeft - M));
    nameLines.forEach((line, k) => draw(line, textLeft, H - 47 - k * 15, 12, blue));
    right(input.reference, W - M, H - 47, 10);
    let hy = H - 65 - (nameLines.length - 1) * 15;
    for (const line of [...company.lines, input.branch].flatMap((text) => wrapDocumentText(font, text, 8, CW - (textLeft - M)))) { draw(line, textLeft, hy, 8, muted); hy -= 11; }
    hy = Math.min(hy, H - 34 - logoSize.height - 6);
    hy -= 20;
    for (const line of wrapDocumentText(font, input.title, 19, CW)) { draw(line, M, hy, 19); hy -= 24; }
    for (const line of wrapDocumentText(font, `${input.sample ? "MẪU MINH HỌA - " : ""}${input.status}`, 9, CW)) { draw(line, M, hy, 9, muted); hy -= 13; }
    page.drawLine({ start: { x: M, y: hy - 5 }, end: { x: W - M, y: hy - 5 }, color: blue, thickness: 1.2 });
    y = hy - 26;
  };
  const ensure = (height: number) => { if (y - height < BOTTOM) addPage(); };
  addPage();
  for (let i = 0; i < input.fields.length; i += 2) {
    const pair = input.fields.slice(i, i + 2), width = (CW - 22) / 2;
    const texts = pair.map(f => wrapDocumentText(font, f.value || "Chưa ghi nhận", 9.5, width));
    let offset = 0;
    const total = Math.max(...texts.map(t => t.length));
    while (offset < total) {
      ensure(47);
      const n = Math.min(total - offset, Math.floor((y - BOTTOM - 22) / 13));
      pair.forEach((field, col) => {
        const x = M + col * (width + 22);
        draw(field.label + (offset ? " (tiếp)" : ""), x, y, 8, muted);
        texts[col].slice(offset, offset + n).forEach((line, k) => draw(line, x, y - 17 - k * 13, 9.5));
      });
      y -= 25 + n * 13; offset += n;
      if (offset < total) addPage();
    }
  }
  const weight = input.columns.reduce((sum, c) => sum + c.width, 0);
  const cols = input.columns.map(c => ({ ...c, width: c.width * CW / weight }));
  const tableHeader = () => {
    const labels = cols.map(c => wrapDocumentText(font, c.label, 8, c.width - 12));
    const height = Math.max(...labels.map(t => t.length)) * 11 + 14;
    ensure(height + 25);
    page.drawRectangle({ x: M, y: y - height, width: CW, height, color: pale });
    let x = M;
    cols.forEach((c, j) => { labels[j].forEach((line, k) => draw(line, x + 6, y - 13 - k * 11, 8, blue)); x += c.width; });
    y -= height;
  };
  tableHeader();
  for (let i = 0; i < input.rows.length; i++) {
    const text = cols.map(c => wrapDocumentText(font, input.rows[i][c.key] ?? "-", 8.5, c.width - 12));
    let offset = 0;
    const total = Math.max(...text.map(t => t.length));
    if (y - Math.min(total * 12 + 14, 120) < BOTTOM) { addPage(); tableHeader(); }
    while (offset < total) {
      const n = Math.min(total - offset, Math.floor((y - BOTTOM - 14) / 12));
      if (n < 1) { addPage(); tableHeader(); continue; }
      const height = n * 12 + 14;
      if (i % 2 === 0) page.drawRectangle({ x: M, y: y - height, width: CW, height, color: rgb(.985, .989, .994) });
      let x = M;
      cols.forEach((c, j) => {
        const chunk = offset && j === 0 && offset >= text[j].length ? text[j].slice(0, 1) : text[j].slice(offset, offset + n);
        chunk.forEach((line, k) => {
        if (c.align === "right") right(line, x + c.width - 6, y - 15 - k * 12, 8.5);
        else draw(line, x + 6, y - 15 - k * 12, 8.5);
      }); x += c.width; });
      y -= height;
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, color: border, thickness: .4 });
      offset += n;
      if (offset < total) { addPage(); tableHeader(); }
    }
  }
  if (!input.rows.length) { ensure(32); draw("Chưa có dòng hàng.", M + 6, y - 19, 9, muted); y -= 32; }
  if (input.totals?.length) {
    y -= 15;
    for (const total of input.totals) {
      const labels = wrapDocumentText(font, total.label, 9, CW * .48);
      const values = wrapDocumentText(font, total.value, 11, CW * .46);
      const h = Math.max(labels.length, values.length) * 15 + 18;
      ensure(h);
      page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: pale });
      labels.forEach((line, k) => draw(line, M + 12, y - 19 - k * 15, 9));
      values.forEach((line, k) => right(line, W - M - 12, y - 19 - k * 15, 11));
      y -= h + 6;
    }
  }
  for (const note of input.notes) {
    if (!note.text.trim()) continue;
    y -= 16; ensure(44); draw(note.title, M, y, 10, blue); y -= 18;
    for (const line of wrapDocumentText(font, note.text, 9, CW)) { ensure(14); draw(line, M, y, 9); y -= 14; }
  }
  if (input.signatures.length) {
    y -= 22; ensure(112);
    const width = CW / input.signatures.length;
    input.signatures.forEach((label, i) => {
      wrapDocumentText(font, label, 9, width - 16).forEach((line, k) => {
        const x = M + i * width + (width - font.widthOfTextAtSize(line, 9)) / 2;
        draw(line, x, y - k * 12, 9);
      });
      const hint = "Ký, ghi rõ họ tên";
      draw(hint, M + i * width + (width - font.widthOfTextAtSize(hint, 8)) / 2, y - 29, 8, muted);
    });
    y -= 112;
  }
  doc.getPages().forEach((p, i, pages) => {
    page = p;
    page.drawLine({ start: { x: M, y: 63 }, end: { x: W - M, y: 63 }, color: border, thickness: .5 });
    right(`Trang ${i + 1}/${pages.length}`, W - M, 24, 7);
  });
  return doc.save();
}

/** The company logo for the heading; a file pdf-lib cannot read is left out rather than blocking the document. */
export async function embedLogo(doc: PDFDocument, logo: CompanyHeading["logo"]): Promise<PDFImage | null> {
  if (!logo) return null;
  try {
    return logo.mime === "image/png" ? await doc.embedPng(logo.bytes) : await doc.embedJpg(logo.bytes);
  } catch {
    return null;
  }
}

/** Scales an image to fit a box, keeping its proportions. */
export function fitInside(image: { width: number; height: number }, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * scale, height: image.height * scale };
}
