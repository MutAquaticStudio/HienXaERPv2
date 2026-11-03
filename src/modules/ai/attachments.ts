import "server-only";

// D50: files attached to a question become Claude content blocks — images and PDFs as they are, text files as text, Excel
// sheets as tab-separated text (the API does not read .xlsx). The file's own bytes decide images and PDFs (not the name).
import type Anthropic from "@anthropic-ai/sdk";
import ExcelJS from "exceljs";

import { AI_ATTACHMENT_MAX_TEXT_CHARS, attachmentKind, attachmentProblem } from "@/modules/ai/attachment-limits";

export type AiContentBlock = Anthropic.Beta.BetaContentBlockParam;
export type AttachmentResult = { blocks: AiContentBlock[]; names: string[] } | { problem: string };

type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** The image type the bytes start with, or null. */
export function imageType(bytes: Uint8Array): ImageType | null {
  const ascii = (from: number, length: number) => String.fromCharCode(...bytes.subarray(from, from + length));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 3) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  return null;
}

const isPdf = (bytes: Uint8Array) => String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";

function clip(text: string): string {
  return text.length > AI_ATTACHMENT_MAX_TEXT_CHARS
    ? `${text.slice(0, AI_ATTACHMENT_MAX_TEXT_CHARS)}\n… (tệp dài, đã cắt bớt phần sau)`
    : text;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    if ("error" in value) return String(value.error);
    return "";
  }
  return String(value);
}

/** Every sheet of a workbook as "Sheet: name" followed by tab-separated rows; null when it is not a readable .xlsx. */
export async function spreadsheetText(data: ArrayBuffer): Promise<string | null> {
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(data); } catch { return null; }
  const parts: string[] = [];
  let length = 0;
  for (const sheet of book.worksheets) {
    parts.push(`Sheet: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (length > AI_ATTACHMENT_MAX_TEXT_CHARS) return;
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map((value) => cellText(value).replace(/[\t\r\n]+/g, " ").trim());
      const line = values.join("\t").replace(/\t+$/, "");
      if (line) { parts.push(line); length += line.length + 1; }
    });
  }
  return parts.join("\n");
}

/** The content blocks of the attached files, or the person-facing reason they cannot be sent. */
export async function attachmentBlocks(files: readonly File[]): Promise<AttachmentResult> {
  const problem = attachmentProblem(files);
  if (problem) return { problem };
  const blocks: AiContentBlock[] = [];
  for (const file of files) {
    const data = await file.arrayBuffer();
    const bytes = new Uint8Array(data);
    const unreadable = { problem: `Không đọc được tệp "${file.name}". Kiểm tra tệp có mở được trên máy không rồi gửi lại.` };
    switch (attachmentKind(file.name)) {
      case "image": {
        const mediaType = imageType(bytes);
        if (!mediaType) return unreadable;
        blocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(bytes).toString("base64") } });
        break;
      }
      case "pdf":
        if (!isPdf(bytes)) return unreadable;
        blocks.push({ type: "document", title: file.name, source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } });
        break;
      case "text": {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "");
        if (!text.trim()) return unreadable;
        blocks.push({ type: "document", title: file.name, source: { type: "text", media_type: "text/plain", data: clip(text) } });
        break;
      }
      case "spreadsheet": {
        const text = await spreadsheetText(data);
        if (!text?.trim()) return unreadable;
        blocks.push({ type: "document", title: file.name, source: { type: "text", media_type: "text/plain", data: clip(text) } });
        break;
      }
      default:
        return unreadable;
    }
  }
  return { blocks, names: files.map((file) => file.name) };
}
