// @vitest-environment node
import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseXlsx } from "./xlsx-parser";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Record<string, string>, declaredSizeOverrides: Record<string, number> = {}) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, contents] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(contents);
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredSizeOverrides[name] ?? data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralBytes = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralBytes, end]);
}

function workbookFiles(sheetXml: string) {
  const serial = (Date.UTC(2026, 9, 14) - Date.UTC(1899, 11, 30)) / 86_400_000;
  return {
    "xl/workbook.xml": '<workbook xmlns:r="r"><workbookPr date1904="0"/><sheets><sheet name="Đơn nhập" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="sharedStrings.xml"/><Relationship Id="rId3" Target="styles.xml"/></Relationships>',
    "xl/sharedStrings.xml": '<sst><si><t>Mã đơn</t></si><si><r><t>Xi Măng </t></r><r><t>Bút Sơn</t></r></si></sst>',
    "xl/styles.xml": '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": sheetXml.replaceAll("__DATE_SERIAL__", String(serial)),
  };
}

describe("safe XLSX parser", () => {
  it("reads text, inline text, exact numeric values, Excel dates, and hidden rows without hiding source data", async () => {
    const fixture = workbookFiles('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Số lượng</t></is></c><c r="C1" t="s"><v>1</v></c></row><row r="2" hidden="1"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>1.25E+2</v></c><c r="C2" s="1"><v>__DATE_SERIAL__</v></c></row></sheetData></worksheet>');
    const parsed = await parseXlsx(zip(fixture));
    expect(parsed.totalRows).toBe(2);
    expect(parsed.hiddenRows).toBe(1);
    expect(parsed.worksheets[0].rows[0].cells.map((cell) => cell?.value)).toEqual(["Mã đơn", "Số lượng", "Xi Măng Bút Sơn"]);
    expect(parsed.worksheets[0].rows[1]).toMatchObject({ hidden: true, cells: [
      { kind: "text", value: "Xi Măng Bút Sơn" }, { kind: "number", value: "125" }, { kind: "date", value: "2026-10-14" },
    ] });
  });

  it("rejects formula cells rather than trusting cached values or evaluating formulas", async () => {
    const fixture = workbookFiles('<worksheet><sheetData><row r="1"><c r="A1"><f>HYPERLINK("https://example.invalid")</f><v>click</v></c></row></sheetData></worksheet>');
    await expect(parseXlsx(zip(fixture))).rejects.toMatchObject({ code: "FORMULA_CELL" });
  });

  it("rejects external relationships and unsafe workbook paths", async () => {
    const external = workbookFiles('<worksheet><sheetData/></worksheet>');
    external["xl/_rels/workbook.xml.rels"] = '<Relationships><Relationship Id="rId1" Target="https://example.invalid/a.xml" TargetMode="External"/></Relationships>';
    await expect(parseXlsx(zip(external))).rejects.toMatchObject({ code: "UNSAFE_WORKBOOK" });
    const traversal = workbookFiles('<worksheet><sheetData/></worksheet>');
    traversal["xl/_rels/workbook.xml.rels"] = '<Relationships><Relationship Id="rId1" Target="../worksheets/sheet1.xml"/></Relationships>';
    await expect(parseXlsx(zip(traversal))).rejects.toMatchObject({ code: "UNSAFE_WORKBOOK" });
  });

  it("rejects declared expansion beyond the ZIP limit and malformed files", async () => {
    const files = workbookFiles('<worksheet><sheetData/></worksheet>');
    await expect(parseXlsx(zip(files, { "xl/worksheets/sheet1.xml": 65 * 1024 * 1024 }))).rejects.toMatchObject({ code: "WORKBOOK_LIMIT_EXCEEDED" });
    await expect(parseXlsx(Buffer.from("not an xlsx"))).rejects.toMatchObject({ code: "INVALID_XLSX" });
  });

  it("rejects formula-driven XML features and duplicate cell references", async () => {
    const doctype = workbookFiles('<!DOCTYPE worksheet [<!ENTITY x "bad">]><worksheet><sheetData/></worksheet>');
    await expect(parseXlsx(zip(doctype))).rejects.toMatchObject({ code: "INVALID_XLSX" });
    const duplicate = workbookFiles('<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="A1"><v>2</v></c></row></sheetData></worksheet>');
    await expect(parseXlsx(zip(duplicate))).rejects.toMatchObject({ code: "INVALID_XLSX" });
  });
});
