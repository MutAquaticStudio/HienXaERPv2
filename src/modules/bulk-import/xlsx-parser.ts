import "server-only";

import { SaxesParser } from "saxes";
import yauzl, { type Entry, type ZipFile } from "yauzl";

export const XLSX_IMPORT_LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  zipEntries: 512,
  expandedBytes: 64 * 1024 * 1024,
  xmlEntryBytes: 12 * 1024 * 1024,
  worksheets: 10,
  rowsPerSheet: 1_000,
  columnsPerRow: 100,
  cellsPerWorkbook: 50_000,
} as const;

export type XlsxCell = { value: string; kind: "text" | "number" | "boolean" | "date" };
export type XlsxRow = { rowNumber: number; hidden: boolean; cells: (XlsxCell | null)[] };
export type XlsxWorksheet = { name: string; hidden: boolean; rows: XlsxRow[] };
export type ParsedXlsx = { worksheets: XlsxWorksheet[]; totalRows: number; hiddenRows: number };

type ZipEntry = Entry & { normalizedName: string };
type Attributes = Record<string, string>;

export class XlsxImportError extends Error {
  readonly code:
    | "FILE_TOO_LARGE"
    | "INVALID_XLSX"
    | "WORKBOOK_LIMIT_EXCEEDED"
    | "UNSAFE_WORKBOOK"
    | "FORMULA_CELL"
    | "UNSUPPORTED_WORKBOOK";

  constructor(code: XlsxImportError["code"], message: string) {
    super(message);
    this.name = "XlsxImportError";
    this.code = code;
  }
}

function invalid(message = "Tệp Excel không hợp lệ hoặc không được hỗ trợ."): XlsxImportError {
  return new XlsxImportError("INVALID_XLSX", message);
}

function attribute(attributes: Attributes, key: string) {
  return attributes[key] ?? "";
}

function parseXml(xml: string, handlers: {
  open?: (name: string, attributes: Attributes) => void;
  close?: (name: string) => void;
  text?: (value: string) => void;
}) {
  const parser = new SaxesParser({ xmlns: false, fragment: false });
  let parseError: Error | null = null;
  parser.on("opentag", (tag) => handlers.open?.(tag.name, tag.attributes as Attributes));
  parser.on("closetag", (tag) => handlers.close?.(tag.name));
  parser.on("text", (value) => handlers.text?.(value));
  parser.on("cdata", (value) => handlers.text?.(value));
  parser.on("doctype", () => { parseError = new Error("DOCTYPE is not allowed"); });
  parser.on("error", (error) => { parseError = error; });
  parser.write(xml).close();
  if (parseError) throw invalid("Tệp Excel có cấu trúc XML không an toàn hoặc bị lỗi.");
  return parser;
}

function normalizeZipPath(name: string) {
  const normalized = name.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.split("/").some((part) => part === "..") || /^[a-z]:/i.test(normalized)) {
    throw new XlsxImportError("UNSAFE_WORKBOOK", "Tệp Excel chứa đường dẫn nội bộ không an toàn.");
  }
  return normalized.replace(/^\.\//, "");
}

async function openZip(buffer: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) reject(invalid());
      else resolve(zip);
    });
  });
}

async function listEntries(zip: ZipFile): Promise<Map<string, ZipEntry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, ZipEntry>();
    let expandedBytes = 0;
    const fail = (error: Error) => {
      zip.close();
      reject(error);
    };
    zip.on("error", () => fail(invalid()));
    zip.on("entry", (entry: Entry) => {
      try {
        if (entries.size >= XLSX_IMPORT_LIMITS.zipEntries) {
          throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Tệp có quá nhiều thành phần nén.");
        }
        const normalizedName = normalizeZipPath(entry.fileName);
        if (entries.has(normalizedName)) throw invalid("Tệp Excel có tên thành phần bị lặp.");
        if (entry.isEncrypted() || entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
          throw new XlsxImportError("UNSUPPORTED_WORKBOOK", "Tệp Excel được mã hóa hoặc dùng kiểu nén không hỗ trợ.");
        }
        expandedBytes += entry.uncompressedSize;
        if (!Number.isSafeInteger(entry.uncompressedSize) || expandedBytes > XLSX_IMPORT_LIMITS.expandedBytes) {
          throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Tệp Excel vượt giới hạn dung lượng sau giải nén.");
        }
        const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (unixMode === 0o120000) throw new XlsxImportError("UNSAFE_WORKBOOK", "Tệp Excel chứa liên kết tệp không được hỗ trợ.");
        entries.set(normalizedName, Object.assign(entry, { normalizedName }));
        zip.readEntry();
      } catch (error) {
        fail(error instanceof Error ? error : invalid());
      }
    });
    zip.on("end", () => resolve(entries));
    zip.readEntry();
  });
}

async function readEntry(zip: ZipFile, entry: ZipEntry, limit = XLSX_IMPORT_LIMITS.xmlEntryBytes) {
  if (entry.uncompressedSize > limit) {
    throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Một phần nội dung Excel vượt giới hạn xử lý.");
  }
  return new Promise<Buffer>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) return reject(invalid());
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > limit) {
          stream.destroy(new Error("expanded entry limit exceeded"));
          return;
        }
        chunks.push(bytes);
      });
      stream.on("error", () => reject(invalid("Không thể giải nén an toàn nội dung Excel.")));
      stream.on("end", () => resolve(Buffer.concat(chunks, total)));
    });
  });
}

async function readXml(zip: ZipFile, entries: Map<string, ZipEntry>, name: string) {
  const entry = entries.get(name);
  if (!entry) throw invalid();
  return (await readEntry(zip, entry)).toString("utf8");
}

function relationshipTarget(target: string) {
  if (!target || target.startsWith("/") || target.includes("\\") || target.split("/").some((part) => part === "..")) {
    throw new XlsxImportError("UNSAFE_WORKBOOK", "Workbook có liên kết nội bộ không an toàn.");
  }
  return target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
}

function parseRelationships(xml: string) {
  const relationships = new Map<string, string>();
  parseXml(xml, {
    open(name, attributes) {
      if (name !== "Relationship") return;
      if (attribute(attributes, "TargetMode") === "External") throw new XlsxImportError("UNSAFE_WORKBOOK", "Tệp Excel có liên kết ra ngoài không được hỗ trợ.");
      const id = attribute(attributes, "Id");
      const target = attribute(attributes, "Target");
      if (!id || !target || relationships.has(id)) throw invalid();
      relationships.set(id, relationshipTarget(target));
    },
  });
  return relationships;
}

function parseWorkbook(xml: string, relationships: Map<string, string>) {
  const sheets: { name: string; hidden: boolean; path: string }[] = [];
  let date1904 = false;
  parseXml(xml, {
    open(name, attributes) {
      if (name === "workbookPr") date1904 = attribute(attributes, "date1904") === "1" || attribute(attributes, "date1904") === "true";
      if (name !== "sheet") return;
      const relationId = attribute(attributes, "r:id");
      const path = relationships.get(relationId);
      const sheetName = attribute(attributes, "name");
      if (!path || !sheetName) throw invalid();
      if (!path.startsWith("xl/worksheets/") || !path.endsWith(".xml")) throw invalid("Workbook có đường dẫn trang tính không được hỗ trợ.");
      sheets.push({ name: sheetName, hidden: attribute(attributes, "state") === "hidden" || attribute(attributes, "state") === "veryHidden", path });
    },
  });
  if (sheets.length < 1 || sheets.length > XLSX_IMPORT_LIMITS.worksheets) {
    throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Tệp phải có từ 1 đến 10 trang tính.");
  }
  if (new Set(sheets.map((sheet) => sheet.name)).size !== sheets.length) throw invalid();
  return { sheets, date1904 };
}

function parseSharedStrings(xml: string) {
  const output: string[] = [];
  let inItem = false;
  let value = "";
  parseXml(xml, {
    open(name) {
      if (name === "si") { inItem = true; value = ""; }
    },
    close(name) {
      if (name === "si") { output.push(value); inItem = false; }
    },
    text(text) { if (inItem) value += text; },
  });
  return output;
}

function parseDateFormats(xml?: string) {
  if (!xml) return new Set<number>();
  const customFormats = new Map<number, string>();
  const dateStyles = new Set<number>();
  let inCellFormats = false;
  let styleIndex = 0;
  parseXml(xml, {
    open(name, attributes) {
      if (name === "numFmt") {
        const id = Number(attribute(attributes, "numFmtId"));
        const format = attribute(attributes, "formatCode");
        if (Number.isInteger(id) && format) customFormats.set(id, format);
      }
      if (name === "cellXfs") inCellFormats = true;
      if (name === "xf" && inCellFormats) {
        const id = Number(attribute(attributes, "numFmtId"));
        const format = customFormats.get(id) ?? "";
        const normalized = format.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "");
        if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58) || /[yd]/i.test(normalized) || /m{1,4}.*[hs]/i.test(normalized)) {
          dateStyles.add(styleIndex);
        }
        styleIndex += 1;
      }
    },
    close(name) { if (name === "cellXfs") inCellFormats = false; },
  });
  return dateStyles;
}

function cellPosition(cellReference: string) {
  const match = /^([A-Z]+)\d+$/i.exec(cellReference);
  if (!match) throw invalid("Một ô trong Excel có vị trí không hợp lệ.");
  let result = 0;
  for (const char of match[1].toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
  return { column: result - 1, row: Number(cellReference.slice(match[1].length)) };
}

function excelDate(raw: string, date1904: boolean) {
  const serial = Number(raw);
  if (!Number.isFinite(serial) || serial < 0 || serial > 2_958_465) throw invalid("Ngày trong Excel vượt phạm vi hỗ trợ.");
  const wholeDays = Math.floor(serial);
  const dayFraction = serial - wholeDays;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const milliseconds = Math.round(dayFraction * 86_400_000);
  const date = new Date(epoch + wholeDays * 86_400_000 + milliseconds);
  if (Number.isNaN(date.getTime())) throw invalid("Ngày trong Excel không hợp lệ.");
  return milliseconds === 0 ? date.toISOString().slice(0, 10) : date.toISOString().slice(0, 19);
}

function normalizeNumber(raw: string) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) throw invalid("Excel chứa giá trị số không hợp lệ.");
  const [mantissa, exponentText] = raw.toLowerCase().split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const decimalPlaces = (mantissa.split(".")[1] ?? "").length;
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 30 || raw.length > 64 || decimalPlaces + Math.max(0, -exponent) > 30) {
    throw invalid("Excel chứa số vượt độ chính xác hỗ trợ.");
  }
  if (exponentText) {
    const negative = mantissa.startsWith("-");
    const digits = mantissa.replace(/^[+-]/, "").replace(".", "");
    const point = (mantissa.replace(/^[+-]/, "").split(".")[0]?.length ?? 0) + exponent;
    const expanded = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? `${digits}${"0".repeat(point - digits.length)}` : `${digits.slice(0, point)}.${digits.slice(point)}`;
    const clean = expanded.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return `${negative ? "-" : ""}${clean}`;
  }
  return raw.startsWith("+") ? raw.slice(1) : raw;
}

function parseWorksheet(xml: string, sharedStrings: string[], dateStyles: Set<number>, date1904: boolean) {
  const rows: XlsxRow[] = [];
  let row: XlsxRow | null = null;
  let cell: { column: number; type: string; style: number; raw: string; inline: string; formula: boolean; inValue: boolean; inInline: boolean } | null = null;
  let totalCells = 0;
  let previousRow = 0;
  parseXml(xml, {
    open(name, attributes) {
      if (name === "row") {
        if (row) throw invalid();
        const declared = Number(attribute(attributes, "r"));
        const rowNumber = Number.isInteger(declared) && declared > previousRow ? declared : previousRow + 1;
        if (rowNumber > 1_000_000) throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Số thứ tự dòng trong Excel vượt giới hạn.");
        previousRow = rowNumber;
        row = { rowNumber, hidden: attribute(attributes, "hidden") === "1" || attribute(attributes, "hidden") === "true", cells: [] };
      } else if (name === "c") {
        if (!row || cell) throw invalid();
        const position = cellPosition(attribute(attributes, "r"));
        if (position.row !== row.rowNumber || row.cells[position.column] !== undefined) throw invalid("Vị trí ô trong Excel không khớp cấu trúc dòng.");
        const column = position.column;
        if (column >= XLSX_IMPORT_LIMITS.columnsPerRow) throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Excel có dòng vượt quá 100 cột.");
        cell = { column, type: attribute(attributes, "t"), style: Number(attribute(attributes, "s") || 0), raw: "", inline: "", formula: false, inValue: false, inInline: false };
      } else if (name === "f" && cell) {
        cell.formula = true;
      } else if (name === "v" && cell) {
        cell.inValue = true;
      } else if (name === "is" && cell) {
        cell.inInline = true;
      }
    },
    close(name) {
      if ((name === "v" || name === "t") && cell) cell.inValue = false;
      if (name === "is" && cell) cell.inInline = false;
      if (name === "c" && cell && row) {
        if (cell.formula) throw new XlsxImportError("FORMULA_CELL", `Không nhận công thức ở dòng ${row.rowNumber}; hãy dán giá trị đã tính.`);
        let value: XlsxCell | null = null;
        if (cell.type === "s") {
          const index = Number(cell.raw);
          if (!Number.isInteger(index) || !sharedStrings[index]) throw invalid();
          value = { kind: "text", value: sharedStrings[index] };
        } else if (cell.type === "inlineStr") {
          value = { kind: "text", value: cell.inline };
        } else if (cell.type === "str") {
          value = { kind: "text", value: cell.raw };
        } else if (cell.type === "b") {
          if (cell.raw !== "0" && cell.raw !== "1") throw invalid();
          value = { kind: "boolean", value: cell.raw === "1" ? "TRUE" : "FALSE" };
        } else if (cell.type === "e") {
          throw invalid("Excel có ô báo lỗi; hãy sửa dữ liệu trong tệp trước khi nhập.");
        } else if (cell.raw !== "") {
          value = dateStyles.has(cell.style)
            ? { kind: "date", value: excelDate(cell.raw, date1904) }
            : { kind: "number", value: normalizeNumber(cell.raw) };
        }
        row.cells[cell.column] = value;
        totalCells += 1;
        if (totalCells > XLSX_IMPORT_LIMITS.cellsPerWorkbook) throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Excel có quá nhiều ô dữ liệu.");
        cell = null;
      } else if (name === "row" && row) {
        if (rows.length >= XLSX_IMPORT_LIMITS.rowsPerSheet) throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Mỗi trang tính chỉ được có tối đa 1.000 dòng.");
        rows.push(row);
        row = null;
      }
    },
    text(value) {
      if (!cell) return;
      if (cell.inValue) cell.raw += value;
      else if (cell.inInline) cell.inline += value;
    },
  });
  if (cell || row) throw invalid();
  return { rows, totalCells };
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedXlsx> {
  if (buffer.byteLength > XLSX_IMPORT_LIMITS.fileBytes) {
    throw new XlsxImportError("FILE_TOO_LARGE", "Tệp Excel không được vượt quá 10 MB.");
  }
  const zip = await openZip(buffer);
  try {
    const entries = await listEntries(zip);
    const workbook = await readXml(zip, entries, "xl/workbook.xml");
    const relationships = parseRelationships(await readXml(zip, entries, "xl/_rels/workbook.xml.rels"));
    const workbookInfo = parseWorkbook(workbook, relationships);
    const sharedPath = [...relationships.entries()].find(([, path]) => path === "xl/sharedStrings.xml")?.[1];
    const stylesPath = [...relationships.entries()].find(([, path]) => path === "xl/styles.xml")?.[1];
    const sharedStrings = sharedPath && entries.has(sharedPath) ? parseSharedStrings(await readXml(zip, entries, sharedPath)) : [];
    const dateStyles = stylesPath && entries.has(stylesPath) ? parseDateFormats(await readXml(zip, entries, stylesPath)) : new Set<number>();
    let totalRows = 0;
    let hiddenRows = 0;
    const worksheets: XlsxWorksheet[] = [];
    for (const sheet of workbookInfo.sheets) {
      const parsed = parseWorksheet(await readXml(zip, entries, sheet.path), sharedStrings, dateStyles, workbookInfo.date1904);
      totalRows += parsed.rows.length;
      hiddenRows += parsed.rows.filter((row) => row.hidden).length;
      worksheets.push({ name: sheet.name, hidden: sheet.hidden, rows: parsed.rows });
    }
    if (totalRows > XLSX_IMPORT_LIMITS.rowsPerSheet * XLSX_IMPORT_LIMITS.worksheets) throw new XlsxImportError("WORKBOOK_LIMIT_EXCEEDED", "Tệp có quá nhiều dòng dữ liệu.");
    return { worksheets, totalRows, hiddenRows };
  } catch (error) {
    if (error instanceof XlsxImportError) throw error;
    throw invalid();
  } finally {
    zip.close();
  }
}
