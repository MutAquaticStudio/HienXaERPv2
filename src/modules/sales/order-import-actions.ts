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
import { derivedOperationId } from "./auto-sourcing";
import { createCommercialLines } from "./commercial-lines";
import { parseOrderWorkbook } from "./order-import";
import { resolveImport, type ImportPreviewOrder } from "./order-import-data";

export type ImportPreview = { ok: boolean; message: string; fileId?: string; orders: ImportPreviewOrder[]; problems: string[] };
export type ImportResult = { key: string; orderId?: string; orderNumber?: string; error?: string };

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function previewOrderImportAction(_: ImportPreview | undefined, form: FormData): Promise<ImportPreview> {
  const access = await requireInternalPermission("orders.create");
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Chọn file Excel để nhập.", orders: [], problems: [] };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "File quá lớn (tối đa 5 MB).", orders: [], problems: [] };
  const data = await file.arrayBuffer();
  const parsed = await parseOrderWorkbook(data);
  if (!parsed.groups.length) return { ok: false, message: parsed.problems[0] ?? "File chưa có đơn nào.", orders: [], problems: parsed.problems };
  try {
    const orders = await resolveImport(await createServerSupabase(), access.branchId, parsed.groups, access.permissions.has("pricing.manage"));
    const digest = createHash("sha256").update(Buffer.from(data)).update(access.branchId).digest("hex");
    const fileId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const ready = orders.filter((order) => order.input).length;
    return { ok: true, fileId, orders, problems: parsed.problems,
      message: ready === orders.length ? `${orders.length} đơn sẵn sàng tạo.` : `${ready}/${orders.length} đơn sẵn sàng; sửa các đơn có lỗi trong file rồi tải lên lại, hoặc tạo trước các đơn đã sẵn sàng.` };
  } catch (error) {
    return { ok: false, message: error instanceof AppError ? error.message : "Không kiểm tra được file. Thử lại sau.", orders: [], problems: [] };
  }
}

const lineSchema = z.object({ materialId: z.guid(), orderedUomId: z.guid(), quantity: z.string().regex(/^\d+(\.\d{1,6})?$/), manualPriceVnd: z.string().regex(/^[1-9]\d{0,14}$/).optional() });
const createSchema = z.object({
  fileId: z.guid(),
  orders: z.array(z.object({ key: z.string().min(1).max(200), customerId: z.guid(), siteId: z.guid(), deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    terms: z.string().max(1000), lines: z.array(lineSchema).min(1).max(50) })).min(1).max(100),
});

export async function createImportedOrdersAction(input: unknown): Promise<ImportResult[]> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return [{ key: "", error: "Dữ liệu nhập không hợp lệ. Tải file lên lại." }];
  const access = await requireInternalPermission("orders.create");
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
      const { data: created } = await supabase.from("sales_orders").select("order_number").eq("id", data).maybeSingle();
      results.push({ key: order.key, orderId: String(data), orderNumber: created?.order_number ?? undefined });
    } catch (error) {
      results.push({ key: order.key, error: error instanceof AppError ? error.message : "Chưa tạo được đơn." });
    }
  }
  revalidatePath("/admin/orders");
  return results;
}
