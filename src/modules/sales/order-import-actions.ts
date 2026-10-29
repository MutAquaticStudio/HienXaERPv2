"use server";

// FB15 (D37): "Nhập đơn bán từ Excel" — read the file and show every order with its prices and problems, then create the
// orders that are ready as drafts. Each order's operation id comes from the file and its group, so pressing "Tạo đơn"
// again (or after a lost answer) never creates the same order twice.
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { autoSourceConfirmedOrder, derivedOperationId, sourcingSummary } from "./auto-sourcing";
import { commandError, creditBlockOf } from "./command-messages";
import { createCommercialLines } from "./commercial-lines";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { MAX_IMPORT_ORDERS, MAX_ORDER_LINES, parseOrderWorkbook, type ImportGroup } from "./order-import";
import { resolveImport, type FixOption, type ImportOverrides, type ImportPreviewOrder } from "./order-import-data";

/** `groups` are the rows read from the file: the preview sends them back with the person's choices (D37) instead of re-uploading. */
export type ImportPreview = { ok: boolean; message: string; fileId?: string; orders: ImportPreviewOrder[]; problems: string[]; groups?: ImportGroup[] };
/** `confirmation`: what "Xác nhận luôn" did — confirmed and sourced like the order screen, or why the order stayed a draft. */
export type ImportResult = { key: string; orderId?: string; orderNumber?: string; error?: string; confirmed?: boolean; confirmation?: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function previewOrderImportAction(_: ImportPreview | undefined, form: FormData): Promise<ImportPreview> {
  const access = await requireInternalPermission("orders.create");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Chọn file Excel để nhập.", orders: [], problems: [] };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "File quá lớn (tối đa 5 MB).", orders: [], problems: [] };
  const data = await file.arrayBuffer();
  const parsed = await parseOrderWorkbook(data);
  if (!parsed.groups.length) return { ok: false, message: parsed.problems[0] ?? "File chưa có đơn nào.", orders: [], problems: parsed.problems };
  const digest = createHash("sha256").update(Buffer.from(data)).update(access.branchId).digest("hex");
  const fileId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return review(access, fileId, parsed.groups, parsed.problems);
}

async function review(access: { branchId: string; permissions: ReadonlySet<string> }, fileId: string, groups: ImportGroup[], problems: string[], overrides?: ImportOverrides): Promise<ImportPreview> {
  try {
    const orders = await resolveImport(await createServerSupabase(), access.branchId, groups, access.permissions.has("pricing.manage"), overrides);
    const ready = orders.filter((order) => order.input).length;
    return { ok: true, fileId, orders, problems, groups,
      message: ready === orders.length ? `${orders.length} đơn sẵn sàng tạo.` : `${ready}/${orders.length} đơn sẵn sàng; chọn lại khách / hàng ở các ô bên dưới (hoặc sửa file rồi tải lên lại).` };
  } catch (error) {
    return { ok: false, message: error instanceof AppError ? error.message : "Không kiểm tra được file. Thử lại sau.", orders: [], problems: [] };
  }
}

const text = (max: number) => z.string().max(max);
const rowSchema = z.object({ row: z.number().int().min(2).max(100000), group: text(60), customerCode: text(200), siteCode: text(200), deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  materialCode: text(200), unit: text(40), quantity: text(40), unitPrice: text(40), note: text(500) });
const reviewSchema = z.object({
  fileId: z.guid(),
  groups: z.array(z.object({ key: text(400), rows: z.array(rowSchema).min(1).max(MAX_ORDER_LINES + 50), problems: z.array(text(400)).max(200) })).min(1).max(MAX_IMPORT_ORDERS),
  problems: z.array(text(400)).max(20),
  overrides: z.object({ customers: z.record(text(400), z.guid()), sites: z.record(text(500), z.guid()), materials: z.record(text(400), z.guid()), units: z.record(text(500), z.guid()) }),
});

/** The same file again with what the person picked for unrecognised customers, sites, goods and units. */
export async function reviewOrderImportAction(input: unknown): Promise<ImportPreview> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Dữ liệu xem trước không hợp lệ. Tải file lên lại.", orders: [], problems: [] };
  const access = await requireInternalPermission("orders.create");
  return review(access, parsed.data.fileId, parsed.data.groups, parsed.data.problems, parsed.data.overrides);
}

/** Customers of the branch for the "chọn lại khách" box: code, name or phone. */
export async function searchImportCustomersAction(term: string): Promise<FixOption[]> {
  const access = await requireInternalPermission("orders.create");
  const q = parseCoreListQuery({ q: term }).q;
  let request = (await createServerSupabase()).from("customers").select("id, code, display_name, phone").eq("branch_id", access.branchId).eq("active", true);
  if (q) request = request.or(`code.ilike.${ilikePattern(q)},display_name.ilike.${ilikePattern(q)},phone.ilike.${ilikePattern(q)}`);
  const { data, error } = await request.order("display_name").limit(25);
  if (error) throw new Error("Không thể tìm khách hàng.");
  return (data ?? []).map((row) => ({ id: row.id, label: `${row.code} · ${row.display_name}`, detail: row.phone ?? undefined }));
}

/** Goods on sale for the "chọn lại hàng" box. */
export async function searchImportMaterialsAction(term: string): Promise<FixOption[]> {
  await requireInternalPermission("orders.create");
  const q = parseCoreListQuery({ q: term }).q;
  let request = (await createServerSupabase()).from("materials").select("id, code, name").eq("active", true).eq("sale_enabled", true);
  if (q) request = request.or(`code.ilike.${ilikePattern(q)},name.ilike.${ilikePattern(q)}`);
  const { data, error } = await request.order("name").limit(25);
  if (error) throw new Error("Không thể tìm hàng hóa.");
  return (data ?? []).map((row) => ({ id: row.id, label: `${row.code} · ${row.name}` }));
}

const lineSchema = z.object({ materialId: z.guid(), orderedUomId: z.guid(), quantity: z.string().regex(/^\d+(\.\d{1,6})?$/), manualPriceVnd: z.string().regex(/^[1-9]\d{0,14}$/).optional() });
const createSchema = z.object({
  fileId: z.guid(),
  confirm: z.boolean().default(false),
  orders: z.array(z.object({ key: z.string().min(1).max(200), customerId: z.guid(), siteId: z.guid(), deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    terms: z.string().max(1000), lines: z.array(lineSchema).min(1).max(50) })).min(1).max(100),
});

export async function createImportedOrdersAction(input: unknown): Promise<ImportResult[]> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return [{ key: "", error: "Dữ liệu nhập không hợp lệ. Tải file lên lại." }];
  const access = await requireInternalPermission("orders.create");
  const confirm = parsed.data.confirm && access.permissions.has("orders.confirm");
  const supabase = await createServerSupabase();
  const results: ImportResult[] = [];
  for (const order of parsed.data.orders) {
    try {
      const lines = await createCommercialLines(order, access.branchId, access.permissions.has("pricing.manage"));
      const { data, error } = await supabase.rpc("create_sales_order_draft", {
        target_branch_id: access.branchId, target_customer_id: order.customerId, target_site_id: order.siteId,
        requested_delivery_at: order.deliveryDate ? new Date(`${order.deliveryDate}T08:00:00+07:00`).toISOString() : new Date().toISOString(),
        commercial_terms: order.terms || null, order_lines: lines, operation_id: derivedOperationId(parsed.data.fileId, `import:${order.key}`),
      });
      if (error || !data) { results.push({ key: order.key, error: "Chưa tạo được đơn (dữ liệu đã thay đổi hoặc không đủ quyền)." }); continue; }
      const orderId = String(data);
      const { data: created } = await supabase.from("sales_orders").select("order_number").eq("id", orderId).maybeSingle();
      const result: ImportResult = { key: order.key, orderId, orderNumber: created?.order_number ?? undefined };
      if (confirm) Object.assign(result, await confirmImported(supabase, access.branchId, orderId, derivedOperationId(parsed.data.fileId, `confirm:${order.key}`)));
      results.push(result);
    } catch (error) {
      results.push({ key: order.key, error: error instanceof AppError ? error.message : "Chưa tạo được đơn." });
    }
  }
  revalidatePath("/admin/orders");
  return results;
}

/** "Xác nhận luôn": the same steps as "Xác nhận" on the order screen — confirm (credit checked), then source from stock
 * first and put the rest on a supplier purchase order. A pressed-again file replays the same commands. */
async function confirmImported(supabase: Awaited<ReturnType<typeof createServerSupabase>>, branchId: string, orderId: string, operationId: string): Promise<Pick<ImportResult, "confirmed" | "confirmation">> {
  const { error } = await supabase.rpc("confirm_sales_order", { target_order_id: orderId, operation_id: operationId });
  if (error) {
    return { confirmed: false, confirmation: creditBlockOf(error.message)
      ? "Vượt hạn mức công nợ — đơn để nháp, mở đơn để xin duyệt." : `Đơn để nháp: ${commandError(error.message, true)}` };
  }
  const sourced = await autoSourceConfirmedOrder(supabase, branchId, orderId, derivedOperationId(operationId, "auto-source"), { onlyIfEnabled: true });
  return { confirmed: true, confirmation: sourcingSummary(sourced.status, sourced.outcome) };
}
