// FB15 (D37): "Nhập đơn bán từ Excel". The template has one row per order line; rows with the same "Nhóm đơn" make one
// order. The reference sheets list the branch's customers (with their sites) and the goods (with their selling units), so
// codes can be copied. Parsing only reads the cells: codes are resolved and prices checked on the server, like the order
// screen.
import ExcelJS from "exceljs";

export const ORDER_SHEET = "Đơn hàng";
export const ORDER_COLUMNS = ["Nhóm đơn", "Mã khách hàng", "Mã công trình", "Ngày giao (dd/mm/yyyy)", "Mã hàng", "Đơn vị", "Số lượng", "Đơn giá (trống = bảng giá)", "Ghi chú đơn"] as const;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_ORDERS = 100;
export const MAX_ORDER_LINES = 50;

export type TemplateReference = {
  customers: Array<{ code: string; name: string; phone?: string | null; sites: Array<{ code: string; name: string }> }>;
  materials: Array<{ code: string; name: string; units: string[] }>;
};

export type ImportRow = { row: number; group: string; customerCode: string; siteCode: string; deliveryDate: string | null; materialCode: string;
  unit: string; quantity: string; unitPrice: string; note: string };
export type ImportGroup = { key: string; rows: ImportRow[]; problems: string[] };
/** Rows of the template sheet that carry the pick lists and the name formulas. */
export const TEMPLATE_ROWS = 500;

/** How people write a code or a name: case, Vietnamese accents, spaces and separators do not matter ("xi mang ha tien" = "Xi măng Hà Tiên", "kh 01" = "KH-01" = "KH01"). */
export function normalizeRef(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[\s\-_./,()]+/g, "");
}

const header = (sheet: ExcelJS.Worksheet, titles: readonly string[], widths: number[]) => {
  sheet.addRow([...titles]);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B63C6" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
};

/** The template workbook (.xlsx): the order sheet with two example orders, then the customers and goods to copy codes from. */
export async function buildOrderTemplate(reference: TemplateReference): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Hiền Xa ERP";
  const orders = book.addWorksheet(ORDER_SHEET);
  header(orders, ORDER_COLUMNS, [11, 16, 16, 20, 16, 10, 11, 22, 30]);
  const customer = reference.customers[0];
  const [first, second] = reference.materials;
  if (customer && first) {
    const site = customer.sites[0]?.code ?? "";
    orders.addRow(["1", customer.code, site, "", first.code, first.units[0] ?? "", 10, "", "Ví dụ: xóa dòng này trước khi nhập"]);
    if (second) orders.addRow(["1", customer.code, site, "", second.code, second.units[0] ?? "", 5, "", ""]);
  }
  orders.getColumn(1).numFmt = "@";
  orders.getColumn(4).numFmt = "dd/mm/yyyy";
  // Pick lists for the codes (typing a name or a phone number is still accepted) and the names shown next to them, so
  // the person sees at once which customer and goods each line is for.
  const lists = book.addWorksheet("Danh sách", { state: "hidden" });
  const customerCodes = reference.customers.map((item) => item.code);
  const materialCodes = reference.materials.map((item) => item.code);
  lists.getColumn(1).values = ["Mã khách hàng", ...customerCodes];
  lists.getColumn(2).values = ["Mã hàng", ...materialCodes];
  orders.getCell(1, 10).value = "Tên khách (tự hiện)";
  orders.getCell(1, 11).value = "Tên hàng (tự hiện)";
  for (const column of [10, 11]) {
    orders.getColumn(column).width = 32;
    Object.assign(orders.getCell(1, column), { font: { bold: true, color: { argb: "FF475569" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } } });
  }
  const list = (column: string, count: number) => ({ type: "list" as const, allowBlank: true, showErrorMessage: false, formulae: [`'Danh sách'!$${column}$2:$${column}$${Math.max(count + 1, 2)}`] });
  for (let row = 2; row <= TEMPLATE_ROWS + 1; row += 1) {
    if (customerCodes.length) orders.getCell(row, 2).dataValidation = list("A", customerCodes.length);
    if (materialCodes.length) orders.getCell(row, 5).dataValidation = list("B", materialCodes.length);
    orders.getCell(row, 10).value = { formula: `IF(B${row}="","",IFERROR(VLOOKUP(B${row},'Khách hàng'!$A:$B,2,FALSE),"(nhận theo tên / SĐT khi tải lên)"))` };
    orders.getCell(row, 11).value = { formula: `IF(E${row}="","",IFERROR(VLOOKUP(E${row},'Hàng hóa'!$A:$B,2,FALSE),"(nhận theo tên khi tải lên)"))` };
  }
  const guide = book.addWorksheet("Hướng dẫn");
  for (const line of [
    "Mỗi dòng của sheet \"Đơn hàng\" là một dòng hàng. Các dòng có cùng \"Nhóm đơn\" (ví dụ 1, 2, A, B) gộp thành một đơn bán.",
    "Mã khách hàng và mã hàng: chọn trong danh sách của ô (hoặc chép từ sheet \"Khách hàng\", \"Hàng hóa\"). Cột \"Tên khách\" và \"Tên hàng\" tự hiện để kiểm tra.",
    "Có thể gõ tên thay cho mã (không cần dấu, không phân biệt hoa thường), hoặc số điện thoại của khách. Tên khớp nhiều khách / nhiều hàng sẽ được báo để chọn lại.",
    "Mã công trình: để trống thì dùng công trình đầu tiên của khách. Ngày giao: để trống là giao ngay.",
    "Đơn vị: ký hiệu đơn vị bán (ví dụ bao, tấn); để trống là đơn vị gốc của hàng.",
    "Đơn giá: để trống thì lấy theo bảng giá của khách; nhập giá riêng cần quyền quản lý giá.",
    "Khi tải lên có thể chọn \"Xác nhận luôn\": đơn được xác nhận như bấm Xác nhận ở màn đơn bán — lấy hàng trong kho trước, phần thiếu tự tạo đơn mua từ nhà cung cấp. Không chọn thì đơn ở trạng thái nháp.",
    "Tối đa 100 đơn, mỗi đơn 50 dòng.",
  ]) guide.addRow([line]);
  guide.getColumn(1).width = 110;
  const customers = book.addWorksheet("Khách hàng");
  header(customers, ["Mã khách hàng", "Tên khách hàng", "Điện thoại", "Mã công trình", "Tên công trình"], [16, 36, 16, 16, 36]);
  for (const item of reference.customers) {
    if (!item.sites.length) customers.addRow([item.code, item.name, item.phone ?? "", "", ""]);
    for (const site of item.sites) customers.addRow([item.code, item.name, item.phone ?? "", site.code, site.name]);
  }
  const materials = book.addWorksheet("Hàng hóa");
  header(materials, ["Mã hàng", "Tên hàng", "Đơn vị bán"], [16, 44, 30]);
  for (const item of reference.materials) materials.addRow([item.code, item.name, item.units.join(", ")]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

const text = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value).trim();
};

/** "dd/mm/yyyy", "yyyy-mm-dd" or an Excel date → "yyyy-mm-dd"; empty → null; anything else → "invalid". */
export function importDate(value: ExcelJS.CellValue): string | null | "invalid" {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return null;
  let match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "invalid";
}

/** Reads the order sheet into groups (one per order), with the problems found in the cells themselves. */
export async function parseOrderWorkbook(data: ArrayBuffer): Promise<{ groups: ImportGroup[]; problems: string[] }> {
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(data); } catch { return { groups: [], problems: ["Không đọc được file. Hãy dùng file Excel (.xlsx) tải từ nút \"Tải file mẫu\"."] }; }
  const sheet = book.getWorksheet(ORDER_SHEET) ?? book.worksheets[0];
  if (!sheet) return { groups: [], problems: ["File không có sheet \"Đơn hàng\"."] };
  const groups = new Map<string, ImportGroup>();
  const problems: string[] = [];
  let count = 0;
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const cells = Array.from({ length: 9 }, (_, index) => row.getCell(index + 1).value);
    if (cells.every((cell) => text(cell) === "")) return;
    count += 1;
    if (count > MAX_IMPORT_ROWS) return;
    const date = importDate(cells[3]);
    const item: ImportRow = { row: number, group: text(cells[0]), customerCode: text(cells[1]), siteCode: text(cells[2]),
      deliveryDate: date === "invalid" ? null : date, materialCode: text(cells[4]), unit: text(cells[5]),
      quantity: text(cells[6]).replace(",", "."), unitPrice: text(cells[7]).replace(/[.\s₫đ]/g, ""), note: text(cells[8]) };
    const key = item.group || `${normalizeRef(item.customerCode)}|${normalizeRef(item.siteCode)}|${item.deliveryDate ?? ""}`;
    const group = groups.get(key) ?? { key, rows: [], problems: [] };
    if (!item.customerCode) group.problems.push(`Dòng ${number}: thiếu mã khách hàng.`);
    if (!item.materialCode) group.problems.push(`Dòng ${number}: thiếu mã hàng.`);
    if (!/^\d+(\.\d{1,6})?$/.test(item.quantity) || Number(item.quantity) <= 0) group.problems.push(`Dòng ${number}: số lượng không hợp lệ.`);
    if (item.unitPrice && !/^[1-9]\d{0,14}$/.test(item.unitPrice)) group.problems.push(`Dòng ${number}: đơn giá phải là số tiền nguyên.`);
    if (date === "invalid") group.problems.push(`Dòng ${number}: ngày giao không đúng dạng dd/mm/yyyy.`);
    const head = group.rows[0];
    if (head && (normalizeRef(head.customerCode) !== normalizeRef(item.customerCode) || normalizeRef(head.siteCode) !== normalizeRef(item.siteCode) || head.deliveryDate !== item.deliveryDate)) {
      group.problems.push(`Dòng ${number}: cùng nhóm đơn "${item.group}" nhưng khác khách hàng, công trình hoặc ngày giao.`);
    }
    group.rows.push(item);
    groups.set(key, group);
  });
  if (count > MAX_IMPORT_ROWS) problems.push(`File có hơn ${MAX_IMPORT_ROWS} dòng; chỉ đọc ${MAX_IMPORT_ROWS} dòng đầu.`);
  if (!count) problems.push("Sheet \"Đơn hàng\" chưa có dòng nào.");
  const list = [...groups.values()];
  if (list.length > MAX_IMPORT_ORDERS) problems.push(`File có ${list.length} đơn; mỗi lần nhập tối đa ${MAX_IMPORT_ORDERS} đơn.`);
  for (const group of list) if (group.rows.length > MAX_ORDER_LINES) group.problems.push(`Đơn có ${group.rows.length} dòng; tối đa ${MAX_ORDER_LINES} dòng mỗi đơn.`);
  return { groups: list.slice(0, MAX_IMPORT_ORDERS), problems };
}
