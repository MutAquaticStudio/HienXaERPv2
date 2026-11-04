// D64 "Đơn bán từ danh sách": the assistant reads orders a customer sent (an Excel file or a photo of a written order) and prepares ONE
// card, a row per order. The customer, site, goods, units and prices are read with the same rules as "Nhập đơn bán từ Excel"
// (resolveImport / createCommercialLines), so a name written without accents or a phone number still finds the record, and an order that
// cannot be read is skipped with every problem named. Each order is created with its own operation id derived from the action.
import { z } from "zod";

import { autoSourceConfirmedOrder } from "@/modules/sales/auto-sourcing";
import { commandError, creditBlockOf } from "@/modules/sales/command-messages";
import { createCommercialLines } from "@/modules/sales/commercial-lines";
import type { ImportRow } from "@/modules/sales/order-import";
import { NO_OVERRIDES, resolveImport, type ImportOrderInput } from "@/modules/sales/order-import-data";
import { assignSellerAfterCreate } from "@/modules/sales/seller";
import { derivedOperationId, parseQuantity, parseVnd, vnFormat } from "./batch-common";
import type { AgentAction, ListView } from "./registry";
import { ResolveError } from "./resolve";

export const ORDER_BATCH_MAX = 40;
export const ORDER_LINES_MAX = 30;

export type OrderRow = { n: number; label: string; site: string; delivery: string; lines: number; total: string; status: "CREATE" | "SKIP"; reason?: string; input?: ImportOrderInput };

const lineSchema = z.object({ hang: z.string().trim().max(200).optional().default(""), don_vi: z.string().trim().max(40).optional().default(""), so_luong: z.union([z.string(), z.number()]).optional(), gia: z.union([z.string(), z.number()]).optional() });
const orderSchema = z.object({ khach: z.string().trim().max(200).optional().default(""), cong_trinh: z.string().trim().max(200).optional().default(""), ngay_giao: z.string().trim().optional().default(""),
  ghi_chu: z.string().trim().max(1000).optional().default(""), dong: z.array(z.unknown()).max(ORDER_LINES_MAX).optional().default([]) });
const inputSchema = z.object({ xac_nhan: z.boolean().optional().default(false), don: z.array(z.unknown()).min(1).max(ORDER_BATCH_MAX) });

/** The rows of every order as the import resolver reads them, or the problems that already stop an order. */
export function toImportGroups(input: readonly unknown[], canSetPrice: boolean) {
  return input.map((raw, index) => {
    const order = orderSchema.safeParse(raw ?? {});
    const value = order.success ? order.data : orderSchema.parse({});
    const problems: string[] = [];
    if (!order.success) problems.push("Thông tin đơn chưa đọc được");
    if (!value.khach) problems.push("Thiếu tên khách");
    if (!value.dong.length) problems.push("Đơn chưa có dòng hàng");
    if (value.ngay_giao && (!/^\d{4}-\d{2}-\d{2}$/.test(value.ngay_giao) || Number.isNaN(Date.parse(`${value.ngay_giao}T00:00:00+07:00`)))) problems.push("Ngày giao dạng yyyy-mm-dd");
    const rows: ImportRow[] = value.dong.map((rawLine, lineIndex) => {
      const line = lineSchema.parse(rawLine ?? {});
      const quantity = parseQuantity(line.so_luong);
      const price = line.gia === undefined || String(line.gia).trim() === "" ? "" : parseVnd(line.gia);
      if (!line.hang) problems.push(`Dòng ${lineIndex + 1}: thiếu tên hàng`);
      if (!quantity) problems.push(`Dòng ${lineIndex + 1}: số lượng chưa đúng`);
      if (price === null) problems.push(`Dòng ${lineIndex + 1}: giá chưa đúng`);
      if (price && !canSetPrice) problems.push(`Dòng ${lineIndex + 1}: giá nhập tay cần quyền đặt giá (bỏ giá để theo bảng giá)`);
      return { row: lineIndex + 1, group: "", customerCode: value.khach, siteCode: value.cong_trinh, deliveryDate: value.ngay_giao || null, materialCode: line.hang, unit: line.don_vi,
        quantity: quantity ?? "", unitPrice: price ?? "", note: value.ghi_chu };
    });
    return { key: `ai-${index + 1}`, rows, problems };
  });
}

export const salesOrdersFromList: AgentAction = {
  kind: "soan_don_ban_tu_danh_sach", area: "Bán hàng", permissions: ["orders.create"],
  description: `Soạn NHIỀU đơn bán một lần (tối đa ${ORDER_BATCH_MAX} đơn, mỗi đơn tối đa ${ORDER_LINES_MAX} dòng) từ danh sách đơn hàng người dùng gửi (Excel hoặc ảnh chụp). Mỗi phần tử trong don là một đơn của một khách; `
    + "giá theo bảng giá của khách (chỉ ghi gia khi chứng từ có giá riêng và người dùng được đặt giá). Chỉ một đơn thì dùng soan_don_ban. xac_nhan=true để xác nhận luôn các đơn (cần quyền xác nhận).",
  properties: {
    xac_nhan: { type: "boolean", description: "true = xác nhận và tự phân nguồn luôn các đơn tạo được." },
    don: { type: "array", description: "Các đơn theo thứ tự trong danh sách.", items: { type: "object", additionalProperties: false, required: ["khach", "dong"], properties: {
      khach: { type: "string", description: "Mã, tên hoặc số điện thoại khách." }, cong_trinh: { type: "string", description: "Mã hoặc tên công trình; trống = công trình đầu tiên." },
      ngay_giao: { type: "string", description: "yyyy-mm-dd; trống = giao ngay." }, ghi_chu: { type: "string" },
      dong: { type: "array", items: { type: "object", additionalProperties: false, required: ["hang", "so_luong"], properties: {
        hang: { type: "string", description: "Mã hoặc tên hàng." }, don_vi: { type: "string", description: "Đơn vị; trống = đơn vị gốc." }, so_luong: { type: "string" }, gia: { type: "string", description: "Đơn giá riêng nếu có, số nguyên đồng." } } } } } } },
  },
  async prepare(context, input) {
    const value = inputSchema.parse(input);
    if (value.xac_nhan && !context.permissions.has("orders.confirm")) throw new ResolveError("Người dùng không có quyền xác nhận đơn bán; soạn đơn nháp (xac_nhan=false).");
    const canSetPrice = context.permissions.has("pricing.manage");
    const groups = toImportGroups(value.don, canSetPrice);
    const resolved = await resolveImport(context.supabase, context.branchId, groups.map((group) => ({ ...group, problems: [] })), canSetPrice, NO_OVERRIDES, { canChooseSeller: false, employeeId: "" });
    const byKey = new Map(resolved.map((order) => [order.key, order]));
    const rows: OrderRow[] = groups.map((group, index): OrderRow => {
      const preview = byKey.get(group.key);
      const own = [...group.problems, ...(preview?.problems ?? [])];
      const base = { n: index + 1, label: preview?.customerName || String((value.don[index] as { khach?: string } | undefined)?.khach ?? "—"), site: preview?.siteName ?? "", delivery: preview?.deliveryDate ?? "", lines: group.rows.length, total: preview?.totalVnd ?? "0" };
      if (own.length || !preview?.input) return { ...base, status: "SKIP", reason: own.slice(0, 3).join("; ") || "Chưa đọc được đơn này" };
      return { ...base, status: "CREATE", input: preview.input };
    });
    const create = rows.filter((row) => row.status === "CREATE");
    if (!create.length) throw new ResolveError(`Không có đơn nào tạo được: ${rows.slice(0, 6).map((row) => `đơn ${row.n} ${row.reason}`).join("; ")}.`);
    const total = create.reduce((sum, row) => sum + BigInt(row.total), 0n).toString();
    return { title: `${value.xac_nhan ? "Tạo và xác nhận" : "Tạo"} ${create.length} đơn bán`, payload: { confirm: value.xac_nhan, rows },
      summary: [{ label: "Sẽ tạo", value: `${create.length} đơn · ${vnFormat(total)} ₫` }, { label: "Xác nhận luôn", value: value.xac_nhan ? "Có" : "Không (đơn nháp)" },
        ...(rows.length > create.length ? [{ label: "Bỏ qua", value: `${rows.length - create.length} đơn (chưa đọc được)` }] : [])] };
  },
  view(payload): ListView | null {
    const rows = payload.rows as OrderRow[] | undefined;
    if (!rows) return null;
    return { columns: ["Khách hàng", "Công trình", "Giao", "Số dòng · Tổng"], verb: payload.confirm ? "tạo và xác nhận" : "tạo", noun: "đơn", okLabel: payload.confirm ? "Tạo + xác nhận" : "Tạo đơn",
      rows: rows.map((row) => ({ n: row.n, status: row.status, ...(row.reason ? { reason: row.reason } : {}), cells: [row.label, row.site || "—",
        row.delivery ? row.delivery.split("-").reverse().join("/") : "Ngay", row.status === "CREATE" ? `${row.lines} dòng · ${vnFormat(row.total)} ₫` : "—"] })) };
  },
  async execute(context, payload, actionId, options) {
    const rows = ((payload.rows ?? []) as OrderRow[]).filter((row) => row.status === "CREATE" && row.input && !options?.exclude?.includes(row.n));
    if (!rows.length) throw new ResolveError("Chưa chọn đơn nào để tạo.");
    const confirm = Boolean(payload.confirm) && context.permissions.has("orders.confirm");
    const failed: string[] = [];
    const notes: string[] = [];
    let done = 0;
    for (const row of rows) {
      const order = row.input!;
      const operationId = derivedOperationId(actionId, `import:${row.n}`);
      try {
        const lines = await createCommercialLines(order, context.branchId, context.permissions.has("pricing.manage"));
        const { data, error } = await context.supabase.rpc("create_sales_order_draft", { target_branch_id: context.branchId, target_customer_id: order.customerId, target_site_id: order.siteId,
          requested_delivery_at: order.deliveryDate ? new Date(`${order.deliveryDate}T08:00:00+07:00`).toISOString() : new Date().toISOString(), commercial_terms: order.terms || null, order_lines: lines, operation_id: operationId });
        if (error || !data) { failed.push(`đơn ${row.n} ${row.label} (chưa tạo được)`); continue; }
        const orderId = String(data);
        await assignSellerAfterCreate(context.supabase, { permissions: context.permissions, employeeId: "", orderId, customerId: order.customerId, siteId: order.siteId, chosen: order.sellerId, operationId });
        if (confirm) {
          const confirmed = await context.supabase.rpc("confirm_sales_order", { target_order_id: orderId, operation_id: derivedOperationId(operationId, "confirm") });
          if (confirmed.error) notes.push(`đơn ${row.n}: ${creditBlockOf(confirmed.error.message) ? "vượt hạn mức công nợ, để nháp" : `để nháp (${commandError(confirmed.error.message, true)})`}`);
          else {
            const sourced = await autoSourceConfirmedOrder(context.supabase, context.branchId, orderId, derivedOperationId(operationId, "auto-source"), { onlyIfEnabled: true }).catch(() => null);
            if (!sourced || sourced.status === "FAILED") notes.push(`đơn ${row.n}: đã xác nhận, chưa tự phân nguồn (mở đơn bấm "Tự phân nguồn")`);
          }
        }
        done += 1;
      } catch (error) {
        failed.push(`đơn ${row.n} ${row.label} (${error instanceof Error && error.message ? error.message.slice(0, 80) : "chưa tạo được"})`);
      }
    }
    if (failed.length) throw new ResolveError(`Đã tạo ${done}/${rows.length} đơn. Chưa tạo được: ${failed.slice(0, 8).join("; ")}. Bấm Xác nhận lại để làm tiếp phần còn lại; đơn đã tạo không bị tạo lại.`);
    return { link: "/admin/orders", message: `Đã tạo ${done} đơn bán${confirm ? " và xác nhận" : " (nháp)"}${notes.length ? `. Lưu ý: ${notes.slice(0, 4).join("; ")}` : ""}.` };
  },
};
