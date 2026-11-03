// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { attachmentKind, attachmentProblem, AI_ATTACHMENT_MAX_TOTAL_BYTES } from "./attachment-limits";
import { attachmentBlocks, imageType, spreadsheetText } from "./attachments";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const file = (name: string, bytes: Uint8Array | string, type = "") => new File([typeof bytes === "string" ? bytes : Uint8Array.from(bytes)], name, { type });

describe("assistant attachments (D50)", () => {
  it("accepts images, PDF, Excel, CSV and text, at most 5 files and 3,5 MB", () => {
    expect(["a.JPG", "b.png", "c.webp", "d.pdf", "e.xlsx", "f.csv", "g.txt"].map(attachmentKind)).toEqual(["image", "image", "image", "pdf", "spreadsheet", "text", "text"]);
    expect(attachmentKind("virus.exe")).toBeNull();
    expect(attachmentProblem([{ name: "a.pdf", size: 10 }])).toBeNull();
    expect(attachmentProblem(Array.from({ length: 6 }, (_, index) => ({ name: `${index}.png`, size: 10 })))).toMatch(/tối đa 5 tệp/);
    expect(attachmentProblem([{ name: "a.docx", size: 10 }])).toMatch(/Chưa đọc được tệp "a.docx"/);
    expect(attachmentProblem([{ name: "a.png", size: 0 }])).toMatch(/trống/);
    expect(attachmentProblem([{ name: "a.png", size: AI_ATTACHMENT_MAX_TOTAL_BYTES }, { name: "b.png", size: 1 }])).toMatch(/3,5 MB/);
  });

  it("knows an image by its bytes, not its name", () => {
    expect(imageType(PNG)).toBe("image/png");
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageType(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(imageType(new TextEncoder().encode("hello"))).toBeNull();
  });

  it("turns files into content blocks: image and PDF as they are, text and Excel as text", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Bảng giá");
    sheet.addRow(["Mã", "Tên", "Giá"]);
    sheet.addRow(["XM01", "Xi măng\tPCB40", 95000]);
    const xlsx = new Uint8Array(await book.xlsx.writeBuffer());
    const result = await attachmentBlocks([
      file("anh.png", PNG), file("hop-dong.pdf", "%PDF-1.7 test"), file("ghi-chu.csv", "﻿ma,so luong\nXM01,20"), file("gia.xlsx", xlsx),
    ]);
    if ("problem" in result) throw new Error(result.problem);
    expect(result.names).toEqual(["anh.png", "hop-dong.pdf", "ghi-chu.csv", "gia.xlsx"]);
    expect(result.blocks[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: Buffer.from(PNG).toString("base64") } });
    expect(result.blocks[1]).toMatchObject({ type: "document", title: "hop-dong.pdf", source: { type: "base64", media_type: "application/pdf" } });
    expect(result.blocks[2]).toMatchObject({ type: "document", title: "ghi-chu.csv", source: { type: "text", data: "ma,so luong\nXM01,20" } });
    expect(result.blocks[3]).toMatchObject({ type: "document", title: "gia.xlsx", source: { type: "text", data: "Sheet: Bảng giá\nMã\tTên\tGiá\nXM01\tXi măng PCB40\t95000" } });
  });

  it("refuses a file whose content does not match its name, with a Vietnamese reason", async () => {
    expect(await attachmentBlocks([file("anh.png", "không phải ảnh")])).toEqual({ problem: expect.stringMatching(/Không đọc được tệp "anh.png"/) });
    expect(await attachmentBlocks([file("a.pdf", "abc")])).toEqual({ problem: expect.stringMatching(/a.pdf/) });
    expect(await spreadsheetText(new TextEncoder().encode("not a workbook").buffer as ArrayBuffer)).toBeNull();
    expect(await attachmentBlocks([file("a.exe", "MZ")])).toEqual({ problem: expect.stringMatching(/Chưa đọc được tệp "a.exe"/) });
  });
});
