"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { AppError } from "@/lib/core/errors";
import { createCommercialLines, documentSchema as salesDocumentSchema, pricePreview } from "@/modules/sales/draft-preparation";
import { buildWarehouseLines, documentSchema as purchaseDocumentSchema } from "@/modules/purchasing/draft-preparation";
import { parseXlsx } from "./xlsx-parser";

const uuid = z.uuid();
const columnIndex = z.number().int().min(0).max(99).nullable().optional();
const mappingSchema = z.object({
  grouping: z.enum(["SINGLE", "BY_SOURCE_REFERENCE", "BY_GROUP_COLUMN"]),
  sourceReferenceColumn: columnIndex,
  groupColumn: columnIndex,
  entityCodeColumn: z.number().int().min(0).max(99),
  siteOrWarehouseCodeColumn: columnIndex,
  materialCodeColumn: z.number().int().min(0).max(99),
  uomCodeColumn: z.number().int().min(0).max(99),
  quantityColumn: z.number().int().min(0).max(99),
  sourcePriceColumn: columnIndex,
  expectedAtColumn: columnIndex,
  termsColumn: columnIndex,
  worksheetName: z.string().min(1).max(100),
  headerRow: z.number().int().min(1).max(1000),
  sourceNamespace: z.string().trim().min(1).max(120),
  sourcePeriod: z.string().trim().min(1).max(40),
  singleReference: z.string().trim().max(160).optional(),
  includeHiddenRows: z.boolean().default(false),
});
const overrideSchema = z.array(z.object({
  groupKey: z.string().min(1).max(128),
  entityCode: z.string().max(160).optional(),
  siteOrWarehouseCode: z.string().max(160).optional(), expectedAt: z.string().max(100).optional(), terms: z.string().max(1000).optional(),
  lines: z.array(z.object({ rowNumber: z.number().int().positive(), materialCode: z.string().max(160).optional(),
    uomCode: z.string().max(160).optional(), quantity: z.string().max(100).optional(), manualPriceVnd: z.string().max(100).optional(),
    manualReason: z.string().max(500).optional(), manualCostVnd: z.string().max(100).optional(), manualCostReason: z.string().max(500).optional() })).max(50),
})).max(100).default([]);
const requestSchema = z.object({ kind: z.enum(["SO", "PO"]), runId: uuid, fileId: uuid,
  mapping: mappingSchema, overrides: overrideSchema }).superRefine((value, context) => {
    if (Buffer.byteLength(JSON.stringify(value.overrides), "utf8") > 600_000) {
      context.addIssue({ code: "custom", path: ["overrides"], message: "Phần sửa từng dòng vượt giới hạn an toàn." });
    }
  });
const createSchema = z.object({ kind: z.enum(["SO", "PO"]), runId: uuid, fileId: uuid, documentId: uuid,
  repeatOf: uuid.nullable().optional(), repeatReason: z.string().trim().max(500).optional() });

const bucket = "bulk-import-private";
type Kind = "SO" | "PO";
type Catalog = { id: string; code: string; name: string; parentId?: string; enabled?: boolean };
type Issue = { code: string; message: string; rowNumber?: number; field?: string };
type PreviewLine = { lineTotalVnd?: string; unitPriceVnd?: string; unitCostVnd?: string; sourcePriceVnd?: string };
type ImportLine = { rowNumber: number; materialCode: string; uomCode: string; quantity: string; sourcePrice: string;
  manualPriceVnd: string; manualReason: string; manualCostVnd: string; manualCostReason: string; material?: Catalog; uom?: Catalog };
type ImportGroup = { groupKey: string; documentId: string | null; operationId: string; sourceReference: string;
  entityCode: string; siteOrWarehouseCode: string; expectedAt: string; terms: string; state: "READY" | "NEEDS_REVIEW" | "INVALID" | "DUPLICATE" | "CREATED";
  duplicateOfDocumentId: string | null; issues: Issue[]; lines: ImportLine[]; candidatePayload: Record<string, unknown> | null;
  totalVnd: string | null; pricePreview: PreviewLine[] };

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function normal(value: string) { return value.trim().normalize("NFKC").replace(/\s+/g, " ").toLocaleUpperCase("vi-VN"); }
function cellValue(row: { cells: ({ value: string } | null)[] }, index: number | null | undefined) {
  return index == null ? "" : String(row.cells[index]?.value ?? "").trim();
}
function hasValue(row: { cells: ({ value: string } | null)[] }) { return row.cells.some((cell) => (cell?.value ?? "").trim() !== ""); }
function issue(code: string, message: string, rowNumber?: number, field?: string): Issue { return { code, message, ...(rowNumber ? { rowNumber } : {}), ...(field ? { field } : {}) }; }
function lookup(catalog: Catalog[], value: string, field: string, rowNumber?: number) {
  const key = normal(value);
  if (!key) return { item: undefined, issue: issue("UNRESOLVED", `Thiếu ${field}.`, rowNumber, field), suggestions: [] as Catalog[] };
  const byCode = catalog.filter((entry) => normal(entry.code) === key);
  if (byCode.length === 1) return { item: byCode[0], issue: undefined, suggestions: byCode };
  if (byCode.length > 1) return { item: undefined, issue: issue("AMBIGUOUS", `${field} khớp nhiều mã ERP; hãy dùng mã khác hoặc sửa danh mục.`, rowNumber, field), suggestions: byCode.slice(0, 5) };
  const byName = catalog.filter((entry) => normal(entry.name) === key);
  if (byName.length) return { item: undefined, issue: issue("NEEDS_REVIEW", `${field} đang là tên, chưa phải mã ERP; hãy nhập mã chính xác.`, rowNumber, field), suggestions: byName.slice(0, 5) };
  return { item: undefined, issue: issue("UNRESOLVED", `Không tìm thấy ${field} theo mã ERP trong phạm vi được phép.`, rowNumber, field), suggestions: [] as Catalog[] };
}

async function fetchCatalog(supabase: Awaited<ReturnType<typeof createServerSupabase>>, kind: Kind, branchId: string) {
  const [customerResult, siteResult, supplierResult, warehouseResult, materialResult, uomResult] = await Promise.all([
    supabase.from("customers").select("id, code, display_name").eq("branch_id", branchId).eq("active", true).order("id").range(0, 19999),
    supabase.from("customer_sites").select("id, code, name, customer_id").eq("active", true).order("id").range(0, 19999),
    kind === "PO" ? supabase.from("suppliers").select("id, code, name").eq("branch_id", branchId).eq("active", true).order("id").range(0, 19999) : Promise.resolve({ data: [], error: null }),
    kind === "PO" ? supabase.from("warehouses").select("id, code, name").eq("branch_id", branchId).eq("active", true).order("id").range(0, 19999) : Promise.resolve({ data: [], error: null }),
    supabase.from("materials").select("id, code, name, sale_enabled, purchase_enabled").eq("active", true).eq(kind === "SO" ? "sale_enabled" : "purchase_enabled", true).order("id").range(0, 19999),
    supabase.from("units_of_measure").select("id, code, symbol").eq("active", true).order("id").range(0, 19999),
  ]);
  if ([customerResult, siteResult, supplierResult, warehouseResult, materialResult, uomResult].some((result) => result.error)) {
    throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể tải danh mục ERP để đối chiếu.", status: 503 });
  }
  if ([customerResult.data, siteResult.data, supplierResult.data, warehouseResult.data, materialResult.data, uomResult.data].some((rows) => (rows?.length ?? 0) >= 20000)) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Danh mục vượt giới hạn đọc an toàn. Hãy thu hẹp phạm vi trước khi nhập.", status: 422 });
  }
  const customers = (customerResult.data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.display_name }));
  const customerIds = new Set(customers.map((row) => row.id));
  const sites = (siteResult.data ?? []).filter((row) => customerIds.has(row.customer_id)).map((row) => ({ id: row.id, code: row.code, name: row.name, parentId: row.customer_id }));
  const suppliers = (supplierResult.data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }));
  const warehouses = (warehouseResult.data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }));
  const materials = (materialResult.data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }));
  const uoms = (uomResult.data ?? []).map((row) => ({ id: row.id, code: row.code, name: row.symbol }));
  return { customers, sites, suppliers, warehouses, materials, uoms };
}

async function authorize(kind: Kind) {
  const permission = kind === "SO" ? "orders.create" : "purchasing.create";
  const access = await requireInternalPermission(permission);
  const required = kind === "SO" ? ["orders.read"] : ["purchasing.read", "purchasing.price.read"];
  if (required.some((value) => !access.permissions.has(value))) throw new AppError({ code: "FORBIDDEN", message: "Bạn chưa có đủ quyền để nhập loại chứng từ này.", status: 403 });
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("bulk_import_feature_status", { target_branch_id: access.branchId, target_kind: kind });
  if (error || data !== true || process.env.HX_BULK_IMPORT_ENABLED !== "true") throw new AppError({ code: error ? "DEPENDENCY_UNAVAILABLE" : "FORBIDDEN", message: error ? "Không thể kiểm tra tính năng nhập tệp." : "Tính năng nhập tệp chưa được bật cho chi nhánh này.", status: error ? 503 : 404 });
  return { access, supabase };
}

async function loadRunFile(supabase: Awaited<ReturnType<typeof createServerSupabase>>, runId: string, fileId: string, expectedBranchId: string, expectedKind: Kind) {
  const { data, error } = await supabase.rpc("get_bulk_import_run", { target_run_id: runId });
  if (error || !data || typeof data !== "object") throw new AppError({ code: "NOT_FOUND", message: "Không tìm thấy lần nhập hoặc bạn không có quyền xem.", status: 404 });
  const run = data as { run_id: string; branch_id: string; document_kind: Kind; files: Record<string, unknown>[] };
  if (run.branch_id !== expectedBranchId || run.document_kind !== expectedKind) throw new AppError({ code: "FORBIDDEN", message: "Lần nhập không thuộc chi nhánh hoặc loại chứng từ hiện tại.", status: 403 });
  const files = Array.isArray(run.files) ? run.files : [];
  const file = files.find((entry) => entry.file_id === fileId);
  if (!file || file.upload_state !== "VERIFIED" || typeof file.object_path !== "string") throw new AppError({ code: "NOT_FOUND", message: "Tệp chưa được xác minh hoặc không còn khả dụng.", status: 404 });
  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(file.object_path);
  if (downloadError || !blob) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không thể đọc tệp đã tải lên.", status: 503 });
  const bytes = Buffer.from(await blob.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== Number(file.byte_size) || bytes.length > 10 * 1024 * 1024 || checksum !== file.checksum_sha256) throw new AppError({ code: "CONFLICT", message: "Tệp đã thay đổi sau khi xác minh; hãy tải lại và kiểm tra lại.", status: 409 });
  return { bytes, file };
}

function toIsoDate(value: string) {
  if (!value) return null;
  const trimmed = value.trim();
  let date: Date;
  const parseLocalDate = (year: number, month: number, day: number) => {
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
      throw new AppError({ code: "VALIDATION_FAILED", message: "Ngày dự kiến không hợp lệ.", status: 422 });
    }
    return new Date(`${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`);
  };
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const localDate = /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(trimmed);
  if (isoDate) date = parseLocalDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
  else {
    date = localDate ? parseLocalDate(Number(localDate[3]), Number(localDate[2]), Number(localDate[1])) : new Date(trimmed);
  }
  if (Number.isNaN(date.getTime())) throw new AppError({ code: "VALIDATION_FAILED", message: "Ngày dự kiến không hợp lệ.", status: 422 });
  return date.toISOString();
}

async function buildReview(inputValue: unknown, persist: boolean) {
  const parsed = requestSchema.safeParse(inputValue);
  if (!parsed.success) return { success: false as const, message: parsed.error.issues.some((entry) => entry.path[0] === "overrides")
    ? "Phần sửa quá lớn. Hãy chia dữ liệu thành nhiều tệp/lần nhập." : "Thông tin đối chiếu chưa hợp lệ." };
  const input = parsed.data;
  try {
    const { access, supabase } = await authorize(input.kind);
    const { bytes, file } = await loadRunFile(supabase, input.runId, input.fileId, access.branchId, input.kind);
    const workbook = await parseXlsx(bytes);
    const sheet = workbook.worksheets.find((entry) => entry.name === input.mapping.worksheetName);
    if (!sheet || sheet.hidden) throw new AppError({ code: "VALIDATION_FAILED", message: "Chọn một trang tính đang hiển thị.", status: 422 });
    const header = sheet.rows.find((row) => row.rowNumber === input.mapping.headerRow);
    if (!header) throw new AppError({ code: "VALIDATION_FAILED", message: "Không tìm thấy dòng tiêu đề đã chọn.", status: 422 });
    if (input.mapping.grouping === "BY_SOURCE_REFERENCE" && input.mapping.sourceReferenceColumn == null) throw new AppError({ code: "VALIDATION_FAILED", message: "Chọn cột mã chứng từ nguồn để chia nhóm.", status: 422 });
    if (input.mapping.grouping === "BY_GROUP_COLUMN" && (input.mapping.groupColumn == null || input.mapping.sourceReferenceColumn == null)) throw new AppError({ code: "VALIDATION_FAILED", message: "Chọn cả cột nhóm đơn và cột mã chứng từ nguồn.", status: 422 });
    if (input.mapping.grouping === "SINGLE" && !input.mapping.singleReference?.trim()) throw new AppError({ code: "VALIDATION_FAILED", message: "Nhập mã chứng từ nguồn và xác nhận toàn bộ tệp là một đơn.", status: 422 });

    const overrideByGroup = new Map(input.overrides.map((entry) => [entry.groupKey, entry]));
    const groups = new Map<string, { sourceReference: string; entityCode: string; siteCode: string; expectedAt: string; terms: string; lines: ImportLine[]; issues: Issue[] }>();
    const dataRows = sheet.rows.filter((row) => row.rowNumber > input.mapping.headerRow && hasValue(row) && (input.mapping.includeHiddenRows || !row.hidden));
    for (const row of dataRows) {
      const sourceReference = input.mapping.grouping === "SINGLE" ? input.mapping.singleReference!.trim() : cellValue(row, input.mapping.sourceReferenceColumn);
      const groupToken = input.mapping.grouping === "SINGLE" ? "single" : input.mapping.grouping === "BY_SOURCE_REFERENCE"
        ? `ref:${normal(sourceReference)}` : `group:${normal(cellValue(row, input.mapping.groupColumn))}`;
      const groupKey = groupToken.trim();
      const groupOverride = overrideByGroup.get(groupKey);
      let group = groups.get(groupKey);
      if (!group) {
        group = { sourceReference, entityCode: cellValue(row, input.mapping.entityCodeColumn), siteCode: cellValue(row, input.mapping.siteOrWarehouseCodeColumn),
          expectedAt: cellValue(row, input.mapping.expectedAtColumn), terms: cellValue(row, input.mapping.termsColumn), lines: [], issues: [] };
        groups.set(groupKey, group);
      } else {
        const currentEntity = cellValue(row, input.mapping.entityCodeColumn);
        const currentSite = cellValue(row, input.mapping.siteOrWarehouseCodeColumn);
        const currentDate = cellValue(row, input.mapping.expectedAtColumn);
        const currentTerms = cellValue(row, input.mapping.termsColumn);
        if ((normal(currentEntity) !== normal(group.entityCode) && groupOverride?.entityCode == null) || (normal(currentSite) !== normal(group.siteCode) && groupOverride?.siteOrWarehouseCode == null)) group.issues.push(issue("MIXED_DOCUMENT_HEADER", "Các dòng cùng chứng từ có thông tin khách/NCC hoặc điểm giao/nhận khác nhau."));
        if (sourceReference.trim() && normal(sourceReference) !== normal(group.sourceReference)) group.issues.push(issue("MIXED_SOURCE_REFERENCE", "Các dòng trong cùng nhóm có mã chứng từ nguồn khác nhau."));
        if (currentDate && group.expectedAt && currentDate !== group.expectedAt && groupOverride?.expectedAt == null) group.issues.push(issue("MIXED_DOCUMENT_DATE", "Ngày dự kiến khác nhau giữa các dòng của cùng chứng từ."));
        if (currentTerms && group.terms && currentTerms !== group.terms && groupOverride?.terms == null) group.issues.push(issue("MIXED_DOCUMENT_TERMS", "Điều khoản khác nhau giữa các dòng của cùng chứng từ."));
        if (!group.expectedAt) group.expectedAt = currentDate;
        if (!group.terms) group.terms = currentTerms;
      }
      if (groupOverride?.entityCode != null) group.entityCode = groupOverride.entityCode;
      if (groupOverride?.siteOrWarehouseCode != null) group.siteCode = groupOverride.siteOrWarehouseCode;
      if (groupOverride?.expectedAt != null) group.expectedAt = groupOverride.expectedAt;
      if (groupOverride?.terms != null) group.terms = groupOverride.terms;
      const lineOverride = groupOverride?.lines.find((entry) => entry.rowNumber === row.rowNumber);
      const rawMaterialCode = lineOverride?.materialCode ?? cellValue(row, input.mapping.materialCodeColumn);
      const rawUomCode = lineOverride?.uomCode ?? cellValue(row, input.mapping.uomCodeColumn);
      const rawQuantity = lineOverride?.quantity ?? cellValue(row, input.mapping.quantityColumn);
      group.lines.push({ rowNumber: row.rowNumber, materialCode: rawMaterialCode, uomCode: rawUomCode,
        quantity: rawQuantity, sourcePrice: cellValue(row, input.mapping.sourcePriceColumn),
        manualPriceVnd: lineOverride?.manualPriceVnd ?? "", manualReason: lineOverride?.manualReason ?? "",
        manualCostVnd: lineOverride?.manualCostVnd ?? "", manualCostReason: lineOverride?.manualCostReason ?? "" });
      if (!sourceReference.trim()) group.issues.push(issue("SOURCE_REFERENCE_REQUIRED", "Thiếu mã chứng từ nguồn; không thể chống trùng an toàn.", row.rowNumber, "sourceReference"));
      if (groupKey.length > 128 || groupKey === "group:" || groupKey === "ref:") group.issues.push(issue("GROUP_KEY_INVALID", "Thiếu hoặc quá dài mã nhóm chứng từ.", row.rowNumber, "groupKey"));
    }
    if (!groups.size) return { success: false as const, message: "Không có dòng hàng trong phạm vi đã chọn." };
    if (groups.size > 100) return { success: false as const, message: "Một tệp chỉ hỗ trợ tối đa 100 chứng từ. Hãy chia tệp thành nhiều lần nhập." };
    for (const group of groups.values()) if (group.lines.length > 50) group.issues.push(issue("LINE_LIMIT", "Một chứng từ chỉ hỗ trợ tối đa 50 dòng hàng."));

    const existingDocs = (Array.isArray(file.documents) ? file.documents : []) as Record<string, unknown>[];
    const catalogs = await fetchCatalog(supabase, input.kind, access.branchId);
    const prepared: ImportGroup[] = [];
    for (const [groupKey, group] of groups) {
      const issues = [...group.issues];
      const existing = existingDocs.find((entry) => entry.group_key === groupKey);
      const operationId = typeof existing?.operation_id === "string" ? existing.operation_id : randomUUID();
      let entity: Catalog | undefined;
      let siteOrWarehouse: Catalog | undefined;
      const entityList = input.kind === "SO" ? catalogs.customers : catalogs.suppliers;
      const entityResult = lookup(entityList, group.entityCode, input.kind === "SO" ? "khách hàng" : "nhà cung cấp");
      if (entityResult.item) entity = entityResult.item; else if (entityResult.issue) issues.push(entityResult.issue);
      if (input.kind === "SO") {
        const siteList = entity ? catalogs.sites.filter((entry) => entry.parentId === entity!.id) : [];
        const siteResult = lookup(siteList, group.siteCode, "công trình");
        if (siteResult.item) siteOrWarehouse = siteResult.item; else if (siteResult.issue) issues.push(siteResult.issue);
      } else {
        const warehouseResult = lookup(catalogs.warehouses, group.siteCode, "kho nhận");
        if (warehouseResult.item) siteOrWarehouse = warehouseResult.item; else if (warehouseResult.issue) issues.push(warehouseResult.issue);
      }
      const resolvedLines: { material_id: string; ordered_uom_id: string; quantity: string; manualPriceVnd?: string; manualReason?: string }[] = [];
      const linesWithMatches: ImportLine[] = [];
      for (const line of group.lines) {
        const materialResult = lookup(catalogs.materials, line.materialCode, "vật tư", line.rowNumber);
        const uomResult = lookup(catalogs.uoms, line.uomCode, "đơn vị tính", line.rowNumber);
        if (materialResult.item && uomResult.item) resolvedLines.push({ material_id: materialResult.item.id, ordered_uom_id: uomResult.item.id, quantity: line.quantity,
          ...(input.kind === "SO" ? { manualPriceVnd: line.manualPriceVnd, manualReason: line.manualReason } : {}) });
        if (materialResult.issue) issues.push(materialResult.issue);
        if (uomResult.issue) issues.push(uomResult.issue);
        linesWithMatches.push({ ...line, ...(materialResult.item ? { material: materialResult.item } : {}), ...(uomResult.item ? { uom: uomResult.item } : {}) });
      }
      let candidatePayload: Record<string, unknown> | null = null;
      let totalVnd: string | null = null;
      let previewLines: PreviewLine[] = [];
      if (!issues.length && entity && siteOrWarehouse && resolvedLines.length === group.lines.length) {
        try {
          const expectedAt = toIsoDate(group.expectedAt);
          if (input.kind === "SO") {
            const document = salesDocumentSchema.parse({ customerId: entity.id, siteId: siteOrWarehouse.id,
              lines: group.lines.map((line) => ({ materialId: lookup(catalogs.materials, line.materialCode, "vật tư", line.rowNumber).item!.id,
                orderedUomId: lookup(catalogs.uoms, line.uomCode, "đơn vị tính", line.rowNumber).item!.id,
                quantity: line.quantity, manualPriceVnd: line.manualPriceVnd, manualReason: line.manualReason })) });
            const actual = await createCommercialLines(document, access.branchId, access.permissions.has("pricing.manage"));
            const preview = pricePreview(document, actual);
            candidatePayload = { target_branch_id: access.branchId, target_customer_id: entity.id, target_site_id: siteOrWarehouse.id,
              requested_delivery_at: expectedAt, commercial_terms: group.terms || null, order_lines: actual, operation_id: operationId };
            totalVnd = preview.totalVnd;
            previewLines = preview.lines.map((line, index) => ({ ...line, sourcePriceVnd: group.lines[index]?.sourcePrice ?? "" }));
          } else {
            const document = purchaseDocumentSchema.parse({ mode: "WAREHOUSE", supplierId: entity.id, warehouseId: siteOrWarehouse.id,
              expectedAt: expectedAt ?? undefined, terms: group.terms, operationId,
              lines: group.lines.map((line) => ({ materialId: lookup(catalogs.materials, line.materialCode, "vật tư", line.rowNumber).item!.id,
                orderedUomId: lookup(catalogs.uoms, line.uomCode, "đơn vị tính", line.rowNumber).item!.id,
                quantity: line.quantity, manualCostVnd: line.manualCostVnd, manualCostReason: line.manualCostReason })) });
            const actual = await buildWarehouseLines(document, access.branchId, access.permissions.has("purchasing.price.manage"));
            candidatePayload = { target_branch_id: access.branchId, target_supplier_id: entity.id, target_warehouse_id: siteOrWarehouse.id,
              expected_at: expectedAt, commercial_terms: group.terms || null, purchase_lines: actual.lines, operation_id: operationId };
            totalVnd = actual.totalVnd;
            previewLines = actual.previews.map((line, index) => ({ ...line, sourcePriceVnd: group.lines[index]?.sourcePrice ?? "" }));
          }
        } catch (error) {
          issues.push(issue("BUSINESS_RULE", error instanceof Error ? error.message : "Dòng hàng chưa thỏa quy tắc ERP."));
        }
      }
      const alreadyCreated = existing?.state === "CREATED" && existing.candidate_payload && typeof existing.candidate_payload === "object";
      if (alreadyCreated) {
        candidatePayload = existing.candidate_payload as Record<string, unknown>;
        totalVnd = null;
        previewLines = [];
        issues.length = 0;
      }
      const state = alreadyCreated ? "CREATED" : issues.length ? issues.some((entry) => entry.code === "NEEDS_REVIEW" || entry.code === "AMBIGUOUS" || entry.code === "UNRESOLVED") ? "NEEDS_REVIEW" : "INVALID" : "READY";
      prepared.push({ groupKey, documentId: typeof existing?.document_id === "string" ? existing.document_id : null,
        operationId, sourceReference: group.sourceReference, entityCode: group.entityCode, siteOrWarehouseCode: group.siteCode,
        expectedAt: group.expectedAt, terms: group.terms, state, duplicateOfDocumentId: typeof existing?.duplicate_of_document_id === "string" ? existing.duplicate_of_document_id : null,
        issues, lines: linesWithMatches, candidatePayload, totalVnd, pricePreview: previewLines });
    }

    if (persist) {
      if (prepared.some((group) => !group.sourceReference.trim() || group.groupKey.length > 128)) {
        return { success: false as const, message: "Cần sửa mã nhóm và mã chứng từ nguồn trước khi lưu kết quả rà soát.", groups: prepared };
      }
      const targetDocuments = prepared.map((group) => ({ group_key: group.groupKey, operation_id: group.operationId,
        source_namespace: input.mapping.sourceNamespace, source_period: input.mapping.sourcePeriod,
        source_reference: group.sourceReference, state: group.state === "CREATED" || group.state === "DUPLICATE" ? "READY" : group.state,
        validation_issues: group.issues, candidate_payload: group.candidatePayload }));
      if (Buffer.byteLength(JSON.stringify(targetDocuments), "utf8") > 800_000) {
        return { success: false as const, message: "Nội dung đối chiếu quá lớn cho một lần lưu an toàn. Hãy chia tệp thành các lần nhập nhỏ hơn.", groups: prepared };
      }
      const { error: saveError } = await supabase.rpc("save_bulk_import_review", {
        target_file_id: input.fileId,
        target_mapping: { ...input.mapping, kind: input.kind, reviewOverrides: input.overrides },
        target_documents: targetDocuments,
      });
      if (saveError) return { success: false as const, message: saveError.message.includes("operation_payload_conflict")
        ? "Lần nhập này đã có dữ liệu khác được lưu. Tải lại để xem phiên bản mới nhất." : "Không thể lưu kết quả rà soát. Hãy thử lại cùng lần nhập.", groups: prepared };
      const { data: savedRun } = await supabase.rpc("get_bulk_import_run", { target_run_id: input.runId });
      const savedFile = (savedRun as { files?: Record<string, unknown>[] } | null)?.files?.find((entry) => entry.file_id === input.fileId);
      const savedDocs = (Array.isArray(savedFile?.documents) ? savedFile.documents : []) as Record<string, unknown>[];
      for (const group of prepared) {
        const saved = savedDocs.find((entry) => entry.group_key === group.groupKey);
        if (saved) {
          group.documentId = String(saved.document_id);
          group.operationId = String(saved.operation_id);
          group.state = String(saved.state) as ImportGroup["state"];
          group.duplicateOfDocumentId = typeof saved.duplicate_of_document_id === "string" ? saved.duplicate_of_document_id : null;
        }
      }
    }
    return { success: true as const, message: persist ? "Đã lưu kết quả đối chiếu. Mỗi chứng từ vẫn là bản nháp." : "Đã đối chiếu danh mục và tính giá theo dữ liệu ERP.",
      hiddenRowsSkipped: input.mapping.includeHiddenRows ? 0 : workbook.hiddenRows, groups: prepared };
  } catch (error) {
    return { success: false as const, message: error instanceof AppError ? error.message : "Không thể đối chiếu tệp. Hãy kiểm tra dữ liệu và thử lại." };
  }
}

export async function previewBulkImportAction(input: unknown) { return buildReview(input, false); }
export async function saveBulkImportReviewAction(input: unknown) { return buildReview(input, true); }

export async function loadBulkImportRunAction(kind: Kind, runId: string) {
  const parsed = z.object({ kind: z.enum(["SO", "PO"]), runId: uuid }).safeParse({ kind, runId });
  if (!parsed.success) return { success: false as const, message: "Mã lần nhập không hợp lệ." };
  try {
    const { access, supabase } = await authorize(parsed.data.kind);
    const { data, error } = await supabase.rpc("get_bulk_import_run", { target_run_id: parsed.data.runId });
    if (error || !data) return { success: false as const, message: "Không tìm thấy lần nhập hoặc bạn không có quyền xem." };
    const run = data as { branch_id?: string; document_kind?: string };
    if (run.branch_id !== access.branchId || run.document_kind !== parsed.data.kind) return { success: false as const, message: "Lần nhập không thuộc chi nhánh hoặc loại chứng từ hiện tại." };
    return { success: true as const, run: data };
  } catch (error) { return { success: false as const, message: error instanceof AppError ? error.message : "Không thể tải lần nhập." }; }
}

export async function createBulkImportDocumentDraftAction(input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { success: false as const, message: "Thông tin tạo bản nháp chưa hợp lệ." };
  const { kind, runId, fileId, documentId } = parsed.data;
  try {
    const { access, supabase } = await authorize(kind);
    const { data: runData, error: runError } = await supabase.rpc("get_bulk_import_run", { target_run_id: runId });
    if (runError || !runData) return { success: false as const, message: "Không tìm thấy lần nhập." };
    const run = runData as { branch_id: string; document_kind: string; files?: Record<string, unknown>[] };
    if (run.branch_id !== access.branchId || run.document_kind !== kind) return { success: false as const, message: "Lần nhập không thuộc chi nhánh hiện tại." };
    const file = run.files?.find((entry) => entry.file_id === fileId);
    const document = (Array.isArray(file?.documents) ? file.documents : []).map((entry) => entry as Record<string, unknown>).find((entry) => entry.document_id === documentId);
    const candidatePayload = document?.candidate_payload;
    if (!document || !candidatePayload || typeof candidatePayload !== "object") return { success: false as const, message: "Chứng từ chưa sẵn sàng; hãy đối chiếu lại danh mục và giá." };
    const payload = candidatePayload as Record<string, unknown>;
    const state = String(document.state);
    if (state === "DUPLICATE" && !parsed.data.repeatOf) {
      const { data, error } = await supabase.rpc("create_bulk_import_document_draft", {
        target_document_id: documentId, target_payload: payload, target_repeat_of: null, target_repeat_reason: null,
      });
      if (error || !data) return { success: false as const, message: "Không thể xác nhận trạng thái chứng từ trùng. Tải lại lần nhập." };
      return { success: true as const, result: data, message: "Đã phát hiện mã chứng từ nguồn trùng. Không tạo bản nháp; hãy đối chiếu chứng từ trước đó." };
    }
    if (state !== "CREATED") {
      const operationId = String(payload.operation_id ?? "");
      if (kind === "SO") {
        const documentInput = salesDocumentSchema.parse({ customerId: payload.target_customer_id, siteId: payload.target_site_id,
          lines: Array.isArray(payload.order_lines) ? (payload.order_lines as Record<string, unknown>[]).map((line) => ({
            materialId: line.material_id, orderedUomId: line.ordered_uom_id, quantity: String(line.quantity),
            manualPriceVnd: String(line.price_source_type === "MANUAL_APPROVED" ? line.unit_price_vnd ?? "" : ""),
            manualReason: String(line.price_source_type === "MANUAL_APPROVED" ? line.override_reason ?? "" : ""),
          })) : [] });
        const currentLines = await createCommercialLines(documentInput, access.branchId, access.permissions.has("pricing.manage"));
        if (stableJson(currentLines) !== stableJson(payload.order_lines)) return { success: false as const, message: "Giá, quy đổi hoặc nguồn hàng đã thay đổi sau khi xem trước. Hãy đối chiếu và xem giá lại." };
        if (operationId !== document.operation_id) return { success: false as const, message: "Mã phục hồi không khớp. Hãy tải lại lần nhập." };
      } else {
        const documentInput = purchaseDocumentSchema.parse({ mode: "WAREHOUSE", supplierId: payload.target_supplier_id, warehouseId: payload.target_warehouse_id,
          expectedAt: typeof payload.expected_at === "string" ? payload.expected_at : undefined, terms: typeof payload.commercial_terms === "string" ? payload.commercial_terms : "",
          operationId, lines: Array.isArray(payload.purchase_lines) ? (payload.purchase_lines as Record<string, unknown>[]).map((line) => ({
            materialId: line.material_id, orderedUomId: line.ordered_uom_id, quantity: String(line.quantity),
            manualCostVnd: String(line.price_source_type === "MANUAL_APPROVED" ? line.unit_cost_vnd ?? "" : ""),
            manualCostReason: String(line.price_source_type === "MANUAL_APPROVED" ? line.override_reason ?? "" : ""),
          })) : [] });
        const current = await buildWarehouseLines(documentInput, access.branchId, access.permissions.has("purchasing.price.manage"));
        if (stableJson(current.lines) !== stableJson(payload.purchase_lines)) return { success: false as const, message: "Giá mua hoặc quy đổi đã thay đổi sau khi xem trước. Hãy đối chiếu và xem giá lại." };
      }
    }
    const { data, error } = await supabase.rpc("create_bulk_import_document_draft", {
      target_document_id: documentId, target_payload: payload, target_repeat_of: parsed.data.repeatOf ?? null,
      target_repeat_reason: parsed.data.repeatReason?.trim() || null,
    });
    if (error || !data || typeof data !== "object") return { success: false as const, message: error?.message.includes("operation_payload_conflict")
      ? "Dữ liệu đã thay đổi trong lúc lưu. Tải lại lần nhập trước khi tiếp tục." : "Không thể tạo bản nháp. Tải lại trạng thái trước khi thử lại." };
    const result = data as { status?: string; result_id?: string; result_entity_id?: string };
    if (result.status === "DUPLICATE") return { success: true as const, result: data, message: "Mã chứng từ nguồn đã được dùng. Không tạo đơn; cần xác nhận nhập lại kèm lý do." };
    revalidatePath(kind === "SO" ? "/admin/orders" : "/admin/purchase-orders");
    const resultId = result.result_id ?? result.result_entity_id;
    if (resultId) revalidatePath(`${kind === "SO" ? "/admin/orders" : "/admin/purchase-orders"}/${resultId}`);
    return { success: true as const, result: data, message: "Đã tạo bản nháp; chưa xác nhận, nhập kho hay phát sinh công nợ." };
  } catch (error) {
    return { success: false as const, message: error instanceof AppError ? error.message : "Không thể tạo bản nháp. Hãy tải lại lần nhập để kiểm tra kết quả." };
  }
}
