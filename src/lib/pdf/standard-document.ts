import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";

type Field = { label: string; value: string };
type Column = { label: string; key: string; width: number; align?: "left" | "right" };

export type StandardPdfInput = {
  title: string;
  reference: string;
  subtitle?: string;
  fields: Field[];
  columns: Column[];
  rows: Array<Record<string, string>>;
  totals?: Field[];
  trace: string;
  disclaimer: string;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 42;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT * 2;
const NAVY = rgb(0.035, 0.12, 0.2);
const INK = rgb(0.08, 0.15, 0.24);
const MUTED = rgb(0.38, 0.43, 0.48);
const PALE = rgb(0.95, 0.96, 0.95);
const ACCENT = rgb(0.87, 0.42, 0.09);

function wrap(font: PDFFont, text: string, size: number, maxWidth: number) {
  const words = String(text || "-").split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

export async function createStandardPdf(input: StandardPdfInput) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "public/fonts/NotoSansVietnamese-Regular.ttf"));
  const font = await document.embedFont(fontBytes);
  document.setTitle(`${input.title} - ${input.reference}`);
  document.setAuthor("Hiền Xa ERP V2");
  document.setCreator("Hiền Xa ERP V2");
  document.setProducer("Hiền Xa ERP V2");

  let page!: PDFPage;
  let y = 0;
  const addPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 104, width: PAGE_WIDTH, height: 104, color: NAVY });
    page.drawRectangle({ x: LEFT, y: PAGE_HEIGHT - 111, width: 72, height: 4, color: ACCENT });
    page.drawText(input.title, { x: LEFT, y: PAGE_HEIGHT - 42, size: 21, font, color: rgb(1, 1, 1) });
    page.drawText(input.reference, { x: LEFT, y: PAGE_HEIGHT - 76, size: 10, font, color: rgb(0.93, 0.95, 0.97) });
    if (input.subtitle) page.drawText(input.subtitle.slice(0, 70), { x: 330, y: PAGE_HEIGHT - 74, size: 8, font, color: rgb(0.82, 0.87, 0.9) });
    y = PAGE_HEIGHT - 137;
  };
  addPage();

  for (let index = 0; index < input.fields.length; index += 2) {
    const pair = input.fields.slice(index, index + 2);
    const rowHeight = Math.max(...pair.map((field) => wrap(font, field.value, 10, 205).length)) * 13 + 21;
    if (y - rowHeight < 90) addPage();
    pair.forEach((field, pairIndex) => {
      const x = LEFT + pairIndex * 258;
      page.drawText(field.label.toUpperCase(), { x, y, size: 7, font, color: MUTED });
      wrap(font, field.value, 10, 205).forEach((line, lineIndex) => page.drawText(line, { x, y: y - 15 - lineIndex * 13, size: 10, font, color: INK }));
    });
    y -= rowHeight;
  }
  y -= 8;

  const drawTableHeader = () => {
    page.drawRectangle({ x: LEFT, y: y - 23, width: CONTENT_WIDTH, height: 23, color: NAVY });
    let x = LEFT;
    input.columns.forEach((column) => {
      page.drawText(column.label, { x: x + 5, y: y - 15, size: 7.5, font, color: rgb(1, 1, 1) });
      x += column.width;
    });
    y -= 23;
  };
  drawTableHeader();

  for (let rowIndex = 0; rowIndex < input.rows.length; rowIndex++) {
    const row = input.rows[rowIndex];
    const wrapped = input.columns.map((column) => wrap(font, row[column.key] ?? "-", 8, column.width - 10));
    const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * 11 + 10;
    if (y - rowHeight < 78) {
      addPage();
      drawTableHeader();
    }
    if (rowIndex % 2 === 0) page.drawRectangle({ x: LEFT, y: y - rowHeight, width: CONTENT_WIDTH, height: rowHeight, color: PALE });
    let x = LEFT;
    input.columns.forEach((column, columnIndex) => {
      wrapped[columnIndex].forEach((line, lineIndex) => {
        const textWidth = font.widthOfTextAtSize(line, 8);
        const textX = column.align === "right" ? x + column.width - textWidth - 5 : x + 5;
        page.drawText(line, { x: textX, y: y - 12 - lineIndex * 11, size: 8, font, color: INK });
      });
      x += column.width;
    });
    y -= rowHeight;
  }

  if (!input.rows.length) {
    page.drawText("Không có dòng dữ liệu trong phạm vi này.", { x: LEFT + 5, y: y - 20, size: 9, font, color: MUTED });
    y -= 36;
  }

  if (input.totals?.length) {
    y -= 14;
    const totalHeight = input.totals.length * 19 + 14;
    if (y - totalHeight < 78) addPage();
    page.drawRectangle({ x: 305, y: y - totalHeight, width: 248, height: totalHeight, color: rgb(0.97, 0.93, 0.88) });
    input.totals.forEach((total, index) => {
      page.drawText(total.label, { x: 319, y: y - 22 - index * 19, size: 8, font, color: MUTED });
      const valueWidth = font.widthOfTextAtSize(total.value, 10);
      page.drawText(total.value, { x: 539 - valueWidth, y: y - 23 - index * 19, size: 10, font, color: INK });
    });
  }

  const pages = document.getPages();
  pages.forEach((current, index) => {
    current.drawLine({ start: { x: LEFT, y: 55 }, end: { x: PAGE_WIDTH - LEFT, y: 55 }, thickness: 0.5, color: rgb(0.78, 0.8, 0.81) });
    current.drawText(input.disclaimer, { x: LEFT, y: 41, size: 7, font, color: MUTED });
    const traceLines = wrap(font, input.trace, 6.5, CONTENT_WIDTH - 34).slice(0, 2);
    traceLines.forEach((line, lineIndex) => current.drawText(line, { x: LEFT, y: 29 - lineIndex * 10, size: 6.5, font, color: MUTED }));
    const pageNumber = `${index + 1}/${pages.length}`;
    current.drawText(pageNumber, { x: PAGE_WIDTH - LEFT - font.widthOfTextAtSize(pageNumber, 7), y: 19, size: 7, font, color: MUTED });
  });

  return document.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
