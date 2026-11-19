import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb } from "pdf-lib";

import { FALLBACK_COMPANY_NAME, type CompanyHeading } from "@/lib/company/profile";
import { embedLogo, fitInside, wrapDocumentText } from "./business-document";

// D52 (Owner 03/11/2026): one print layout for every document, in the familiar Vietnamese shop-invoice shape — the shop's
// logo and details at the top, the title centred with its number and date, the customer block, a ruled table, the totals
// on the right with the QR to pay beside them, signatures, thanks. Black on white so it prints well in one colour.
// Three papers: A4 (orders, deliveries, purchase orders, debt statements), A5 landscape (receipts and payment vouchers)
// and K80 (80 mm receipt printers at the counter; the page is as tall as its content).

export type Paper = "A4" | "A5" | "K80";
export type PrintLine = { label: string; value: string; strong?: boolean };
export type PrintColumn = { label: string; key: string; width: number; align?: "left" | "right" | "center" };
/** One goods row for the K80 list (name, then "qty unit × price" and the amount). */
export type PrintItem = { name: string; quantity: string; unit: string; price?: string; amount?: string; note?: string };

export type PrintDocumentInput = {
  paper: Paper;
  title: string;
  /** "Số: SO-2026-000080" under the title. */
  reference: string;
  /** "Ngày 03/11/2026 09:00" under the title (already formatted). */
  issuedAt: string;
  company: CompanyHeading;
  /** Status / version, small under the reference (e.g. "Đã xác nhận"). */
  status?: string;
  /** The party block (Khách hàng, Địa chỉ, Điện thoại…), two per row on A4 / A5, one per row on K80. */
  info: PrintLine[];
  columns: PrintColumn[];
  rows: Record<string, string>[];
  /** K80 prints these instead of the table. */
  items?: PrintItem[];
  emptyText?: string;
  /** Right-aligned totals; `strong` lines are bold and larger (Tổng thanh toán, Tổng nợ). */
  totals?: PrintLine[];
  /** A VietQR image with its caption (bank, account, amount, transfer note), beside the totals. */
  qr?: { image: Uint8Array; caption: string[] } | null;
  notes?: { title: string; text: string }[];
  signatures: string[];
  /** "Cảm ơn quý khách!" at the end. */
  thanks?: string;
  /** Small print at the foot of the last page (source, time printed). */
  footnote?: string;
  sample?: boolean;
};

type Box = { width: number; height: number; margin: number; scale: number };
const PAPERS: Record<Paper, Box> = {
  A4: { width: 595.28, height: 841.89, margin: 40, scale: 1 },
  A5: { width: 595.28, height: 419.53, margin: 30, scale: 0.92 },
  K80: { width: 226.77, height: 3000, margin: 10, scale: 0.86 },
};
const INK = rgb(0.07, 0.07, 0.08);
const MUTED = rgb(0.36, 0.37, 0.4);
const RULE = rgb(0.55, 0.56, 0.6);
const HEAD = rgb(0.92, 0.93, 0.95);

let fontCache: Promise<{ regular: Uint8Array; bold: Uint8Array }> | null = null;
function fontFiles() {
  fontCache ??= Promise.all([
    readFile(path.join(process.cwd(), "public/fonts/NotoSansVietnamese-Regular.ttf")),
    readFile(path.join(process.cwd(), "public/fonts/NotoSans-Bold.ttf")),
  ]).then(([regular, bold]) => ({ regular, bold }));
  return fontCache;
}

export async function createPrintDocument(input: PrintDocumentInput): Promise<Uint8Array> {
  const paper = PAPERS[input.paper];
  const k80 = input.paper === "K80";
  const s = (size: number) => size * paper.scale;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const files = await fontFiles();
  const regular = await doc.embedFont(files.regular, { subset: true });
  const bold = await doc.embedFont(files.bold, { subset: true });
  const company = input.company?.name ? input.company : { name: FALLBACK_COMPANY_NAME, lines: [] };
  doc.setTitle(`${input.title} - ${input.reference}`);
  doc.setAuthor(company.name);
  doc.setCreator("Hiền Xa ERP");
  const logo = await embedLogo(doc, company.logo);
  // The QR service answers PNG or JPEG; an image pdf-lib cannot read is left out (the caption still prints as a note).
  const qr = input.qr ? await doc.embedPng(input.qr.image).catch(() => doc.embedJpg(input.qr!.image)).catch(() => null) : null;

  const W = paper.width, M = paper.margin, CW = W - 2 * M, BOTTOM = k80 ? 0 : M + 26;
  let page!: PDFPage;
  let y = 0;
  const wrap = (font: PDFFont, text: string, size: number, width: number) => wrapDocumentText(font, text, size, width);
  const text = (value: string, x: number, baseline: number, size: number, font: PDFFont = regular, color = INK) =>
    page.drawText(value, { x, y: baseline, size, font, color });
  const textRight = (value: string, right: number, baseline: number, size: number, font: PDFFont = regular, color = INK) =>
    text(value, right - font.widthOfTextAtSize(value, size), baseline, size, font, color);
  const textCenter = (value: string, center: number, baseline: number, size: number, font: PDFFont = regular, color = INK) =>
    text(value, center - font.widthOfTextAtSize(value, size) / 2, baseline, size, font, color);
  const rule = (from: number, to: number, at: number, thickness = 0.6, color = RULE) =>
    page.drawLine({ start: { x: from, y: at }, end: { x: to, y: at }, thickness, color });

  // ---- page header: logo + shop on the first page; the title and number on every page.
  const header = (first: boolean) => {
    page = doc.addPage([W, paper.height]);
    y = paper.height - M;
    if (first) {
      if (k80) {
        if (logo) { const size = fitInside(logo, 120, 34); page.drawImage(logo, { x: (W - size.width) / 2, y: y - size.height, ...size }); y -= size.height + 6; }
        for (const line of wrap(bold, company.name.toUpperCase(), s(11), CW)) { textCenter(line, W / 2, y - s(11), s(11), bold); y -= s(14); }
        for (const line of company.lines.flatMap((value) => wrap(regular, value, s(8), CW))) { textCenter(line, W / 2, y - s(8), s(8), regular, MUTED); y -= s(10.5); }
        y -= 4;
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: RULE, dashArray: [2, 2] });
        y -= 6;
      } else if (input.paper === "A5") {
        // A5 landscape is short: the shop on the left, the title, number and date on the right of the same band.
        const logoSize = logo ? fitInside(logo, 60, 36) : { width: 0, height: 0 };
        if (logo) page.drawImage(logo, { x: M, y: y - logoSize.height, ...logoSize });
        const left = M + (logo ? logoSize.width + 10 : 0), width = CW * 0.58 - (left - M);
        let hy = y;
        for (const line of wrap(bold, company.name.toUpperCase(), s(11), width)) { text(line, left, hy - s(11), s(11), bold); hy -= s(13.5); }
        for (const line of company.lines.flatMap((value) => wrap(regular, value, s(7.5), width))) { text(line, left, hy - s(7.5), s(7.5), regular, MUTED); hy -= s(10); }
        let ty = y;
        const titleWidth = CW * 0.4;
        for (const line of wrap(bold, `${input.sample ? "MẪU — " : ""}${input.title}`, s(16), titleWidth)) { textRight(line, W - M, ty - s(16), s(16), bold); ty -= s(20); }
        textRight(`Số: ${input.reference}`, W - M, ty - s(9), s(9.5), bold); ty -= s(13);
        textRight(input.issuedAt, W - M, ty - s(9), s(9), regular, MUTED); ty -= s(12);
        if (input.status) { textRight(input.status, W - M, ty - s(8), s(8), regular, MUTED); ty -= s(11); }
        y = Math.min(hy, ty, y - logoSize.height) - 6;
        rule(M, W - M, y, 0.8, INK);
        y -= s(12);
        return;
      } else {
        const logoSize = logo ? fitInside(logo, 86, 52) : { width: 0, height: 0 };
        if (logo) page.drawImage(logo, { x: M, y: y - logoSize.height, ...logoSize });
        const left = M + (logo ? logoSize.width + 12 : 0), width = CW - (left - M);
        let hy = y;
        for (const line of wrap(bold, company.name.toUpperCase(), s(13), width)) { text(line, left, hy - s(13), s(13), bold); hy -= s(16); }
        for (const line of company.lines.flatMap((value) => wrap(regular, value, s(8.5), width))) { text(line, left, hy - s(8.5), s(8.5), regular, MUTED); hy -= s(11.5); }
        y = Math.min(hy, y - logoSize.height) - 8;
        rule(M, W - M, y, 0.8, INK);
        y -= 4;
      }
    }
    y -= s(first ? 20 : 4);
    if (!first) { text(`${company.name} · ${input.title} ${input.reference} (tiếp)`, M, y, s(8), regular, MUTED); y -= s(14); return; }
    const titleSize = s(k80 ? 13 : input.paper === "A4" ? 18 : 15);
    for (const line of wrap(bold, `${input.sample ? "MẪU — " : ""}${input.title}`, titleSize, CW)) { textCenter(line, W / 2, y, titleSize, bold); y -= titleSize + 5; }
    textCenter(`Số: ${input.reference}`, W / 2, y, s(9.5), bold); y -= s(13);
    textCenter(input.issuedAt, W / 2, y, s(9), regular, MUTED); y -= s(12);
    if (input.status) { textCenter(input.status, W / 2, y, s(8), regular, MUTED); y -= s(11); }
    y -= s(8);
  };
  const ensure = (height: number) => {
    if (k80 || y - height >= BOTTOM) return false;
    header(false);
    return true;
  };

  header(true);

  // ---- the party block: "Khách hàng: …" lines, two columns on A4 / A5.
  const perRow = k80 ? 1 : 2, gap = 18, colWidth = (CW - gap * (perRow - 1)) / perRow;
  for (let i = 0; i < input.info.length; i += perRow) {
    const pair = input.info.slice(i, i + perRow);
    const blocks = pair.map((line) => {
      const label = `${line.label}: `;
      const labelWidth = bold.widthOfTextAtSize(label, s(9));
      const first = wrap(regular, line.value || "—", s(9), colWidth - labelWidth);
      const rest = first.length > 1 ? wrap(regular, first.slice(1).join(" "), s(9), colWidth) : [];
      return { label, labelWidth, lines: [first[0], ...rest] };
    });
    const height = Math.max(...blocks.map((block) => block.lines.length)) * s(12.5) + s(3);
    ensure(height);
    blocks.forEach((block, col) => {
      const x = M + col * (colWidth + gap);
      text(block.label, x, y - s(9), s(9), bold);
      block.lines.forEach((line, k) => text(line, k === 0 ? x + block.labelWidth : x, y - s(9) - k * s(12.5), s(9)));
    });
    y -= height;
  }
  y -= s(8);

  // ---- goods: a ruled table (A4 / A5) or a list (K80).
  if (k80) {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: RULE, dashArray: [2, 2] });
    y -= 4;
    const items = input.items ?? [];
    for (const item of items) {
      for (const line of wrap(bold, item.name, s(9), CW)) { text(line, M, y - s(9), s(9), bold); y -= s(11.5); }
      const detail = [[item.quantity, item.unit].filter(Boolean).join(" "), item.price ? `× ${item.price}` : ""].filter(Boolean).join(" ");
      text(detail, M, y - s(8.5), s(8.5), regular, MUTED);
      if (item.amount) textRight(item.amount, W - M, y - s(8.5), s(9), bold);
      y -= s(12);
      if (item.note) { for (const line of wrap(regular, item.note, s(7.5), CW)) { text(line, M, y - s(7.5), s(7.5), regular, MUTED); y -= s(10); } }
      y -= 3;
    }
    if (!items.length && input.emptyText) { text(input.emptyText, M, y - s(9), s(9), regular, MUTED); y -= s(14); }
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: RULE, dashArray: [2, 2] });
    y -= 6;
  } else if (input.columns.length) {
    const weight = input.columns.reduce((sum, column) => sum + column.width, 0);
    const cols = input.columns.map((column) => ({ ...column, width: column.width * CW / weight }));
    const pad = 5, line = s(11.5);
    const drawHead = () => {
      const labels = cols.map((column) => wrap(bold, column.label, s(8.5), column.width - pad * 2));
      const height = Math.max(...labels.map((lines) => lines.length)) * line + 10;
      ensure(height + line + 12);
      page.drawRectangle({ x: M, y: y - height, width: CW, height, color: HEAD, borderColor: RULE, borderWidth: 0.6 });
      let x = M;
      cols.forEach((column, j) => {
        labels[j].forEach((value, k) => textCenter(value, x + column.width / 2, y - 6 - s(8.5) - k * line, s(8.5), bold));
        if (j) page.drawLine({ start: { x, y }, end: { x, y: y - height }, thickness: 0.6, color: RULE });
        x += column.width;
      });
      y -= height;
    };
    drawHead();
    input.rows.forEach((row) => {
      // An empty cell stays empty (room to write by hand), never a dash.
      const cells = cols.map((column) => row[column.key] ? wrap(regular, row[column.key], s(9), column.width - pad * 2) : [""]);
      const height = Math.max(...cells.map((lines) => lines.length)) * line + 9;
      if (ensure(height)) drawHead();
      page.drawRectangle({ x: M, y: y - height, width: CW, height, borderColor: RULE, borderWidth: 0.6 });
      let x = M;
      cols.forEach((column, j) => {
        cells[j].forEach((value, k) => {
          const baseline = y - 5 - s(9) - k * line;
          if (column.align === "right") textRight(value, x + column.width - pad, baseline, s(9));
          else if (column.align === "center") textCenter(value, x + column.width / 2, baseline, s(9));
          else text(value, x + pad, baseline, s(9));
        });
        if (j) page.drawLine({ start: { x, y }, end: { x, y: y - height }, thickness: 0.6, color: RULE });
        x += column.width;
      });
      y -= height;
    });
    if (!input.rows.length && input.emptyText) {
      const height = line + 12;
      ensure(height);
      page.drawRectangle({ x: M, y: y - height, width: CW, height, borderColor: RULE, borderWidth: 0.6 });
      textCenter(input.emptyText, W / 2, y - 6 - s(9), s(9), regular, MUTED);
      y -= height;
    }
    y -= s(10);
  }

  // ---- totals on the right, the QR to pay on the left.
  const totals = input.totals ?? [];
  const qrSize = qr ? (k80 ? 120 : input.paper === "A4" ? 104 : 86) : 0;
  if (totals.length || qr) {
    const totalsLeft = k80 ? M : M + CW * 0.44;
    const rows = totals.map((line) => ({ line, size: s(line.strong ? 10.5 : 9) }));
    const totalsHeight = rows.reduce((sum, row) => sum + row.size + 7, 0);
    const caption = qr && input.qr ? input.qr.caption.flatMap((value) => wrap(regular, value, s(7.5), k80 ? CW : CW * 0.44 - qrSize - 14)) : [];
    const qrBlock = qr ? (k80 ? qrSize + 6 + caption.length * s(10) : Math.max(qrSize, caption.length * s(10))) : 0;
    ensure(k80 ? totalsHeight : Math.max(totalsHeight, qrBlock));
    const top = y;
    rows.forEach(({ line, size }) => {
      const font = line.strong ? bold : regular;
      text(line.label, totalsLeft, y - size, size, font, line.strong ? INK : MUTED);
      textRight(line.value, W - M, y - size, size, bold);
      y -= size + 7;
      if (line.strong && !k80) rule(totalsLeft, W - M, y + 3, 0.4);
    });
    if (qr && input.qr) {
      if (k80) {
        y -= 6;
        page.drawImage(qr, { x: (W - qrSize) / 2, y: y - qrSize, width: qrSize, height: qrSize });
        y -= qrSize + 4;
        caption.forEach((value) => { textCenter(value, W / 2, y - s(7.5), s(7.5), regular, MUTED); y -= s(10); });
      } else {
        page.drawImage(qr, { x: M, y: top - qrSize, width: qrSize, height: qrSize });
        caption.forEach((value, k) => text(value, M + qrSize + 10, top - s(9) - k * s(10.5), s(7.5), k === 0 ? bold : regular, k === 0 ? INK : MUTED));
        y = Math.min(y, top - qrBlock);
      }
    }
    y -= s(10);
  }

  // ---- notes.
  const notes = [...(input.qr && !qr ? [{ title: "Chuyển khoản", text: input.qr.caption.join(" · ") }] : []), ...(input.notes ?? [])];
  for (const note of notes) {
    if (!note.text.trim()) continue;
    const lines = wrap(regular, note.text, s(8.5), CW);
    ensure(s(12) + Math.min(lines.length, 3) * s(11));
    text(`${note.title}:`, M, y - s(8.5), s(8.5), bold);
    y -= s(12);
    for (const value of lines) { ensure(s(11)); text(value, M, y - s(8.5), s(8.5), regular, MUTED); y -= s(11); }
    y -= s(4);
  }

  // ---- signatures.
  if (input.signatures.length) {
    const height = k80 ? 0 : input.paper === "A4" ? 96 : 62;
    if (!k80) {
      ensure(height);
      y -= s(8);
      const width = CW / input.signatures.length;
      input.signatures.forEach((label, i) => {
        const center = M + i * width + width / 2;
        textCenter(label, center, y - s(9.5), s(9.5), bold);
        textCenter("(Ký, ghi rõ họ tên)", center, y - s(9.5) - s(13), s(8), regular, MUTED);
      });
      y -= height;
    }
  }

  // ---- thanks, footnote, page numbers.
  if (input.thanks) {
    ensure(s(16));
    textCenter(input.thanks, W / 2, y - s(9.5), s(9.5), bold);
    y -= s(16);
  }
  if (k80 && input.footnote) {
    for (const value of wrap(regular, input.footnote, s(6.5), CW)) { textCenter(value, W / 2, y - s(6.5), s(6.5), regular, MUTED); y -= s(9); }
  }
  if (k80) {
    // The roll is cut where the content ends.
    const used = paper.height - y + M;
    page.setMediaBox(0, paper.height - used, W, used);
    page.setCropBox(0, paper.height - used, W, used);
  } else {
    const pages = doc.getPages();
    pages.forEach((current, index) => {
      page = current;
      if (input.footnote) text(input.footnote, M, M - 4, 6.5, regular, MUTED);
      if (pages.length > 1) textRight(`Trang ${index + 1}/${pages.length}`, W - M, M - 4, 7, regular, MUTED);
    });
  }
  return doc.save();
}

export type { PDFImage };
