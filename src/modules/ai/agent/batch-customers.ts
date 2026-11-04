// D63: "Tạo N khách hàng" — the assistant reads a customer list (an Excel / CSV file, or a photo of a written list) and
// prepares ONE card: every row with "Tạo" or "Bỏ qua" and why (already a customer by phone or code, twice in the file,
// no name). The person unticks rows, then confirms once; each row is saved through the normal customer command with its
// own operation id derived from the action, so confirming again after a failure only finishes the rows still missing.
import { z } from "zod";

import { normalizePhone } from "@/lib/auth/login-identifier";
import { derivedOperationId } from "@/modules/sales/auto-sourcing";
import { phoneKey } from "@/modules/sales/order-match";
import type { AgentAction, AgentContext, ListView } from "./registry";
import { ResolveError } from "./resolve";

export const BATCH_CUSTOMERS_KIND = "soan_tao_nhieu_khach_hang";
export const BATCH_CUSTOMERS_MAX = 100;

export type BatchCustomerRow = {
  /** 1-based row of the list as the assistant read it. */
  n: number;
  ten: string;
  loai: "BUSINESS" | "INDIVIDUAL";
  dien_thoai: string;
  dia_chi_giao: string;
  email: string;
  ma_so_thue: string;
  ghi_chu: string;
  code: string;
  status: "CREATE" | "SKIP";
  reason?: string;
};

const text = (max: number) => z.string().trim().max(max).optional().default("");
const rowSchema = z.object({
  ten: z.string().trim().max(160).optional().default(""), loai: z.enum(["BUSINESS", "INDIVIDUAL"]).optional().default("BUSINESS"),
  dien_thoai: text(40), dia_chi_giao: text(300), ma: z.string().trim().toUpperCase().max(32).optional().default(""), email: text(160),
  ma_so_thue: text(20), ghi_chu: text(500),
});
const inputSchema = z.object({ khach: z.array(z.unknown()).min(1).max(BATCH_CUSTOMERS_MAX) });
const CODE = /^[A-Z0-9_-]{2,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A phone as it is kept: 0xxxxxxxxx when it reads as a Vietnamese number (an Excel 901234567 included), else as typed. */
export function keptPhone(value: string): string {
  if (!value.trim()) return "";
  const digits = value.replace(/\D/g, "");
  return normalizePhone(value) ?? (digits.length === 9 ? normalizePhone(`0${digits}`) : null) ?? value.trim();
}

/** The code of a new customer without one: KH + 6 characters of the action + the row, unique enough to never collide. */
export const generatedCode = (actionKey: string, n: number) => `KH${actionKey.replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase()}${String(n).padStart(2, "0")}`;

type Existing = { code: string; display_name: string; phone: string | null };

/** Every row checked against the branch's customers and the other rows of the list. */
export function checkRows(input: readonly unknown[], existing: readonly Existing[], actionKey: string): BatchCustomerRow[] {
  const byPhone = new Map<string, Existing>(), byCode = new Map<string, Existing>();
  for (const customer of existing) {
    const key = phoneKey(customer.phone);
    if (key && !byPhone.has(key)) byPhone.set(key, customer);
    byCode.set(customer.code.toUpperCase(), customer);
  }
  const seenPhone = new Map<string, number>(), seenCode = new Map<string, number>(), seenName = new Map<string, number>();
  return input.map((raw, index): BatchCustomerRow => {
    const n = index + 1;
    const parsed = rowSchema.safeParse(raw ?? {});
    const value = parsed.success ? parsed.data : rowSchema.parse({});
    const phone = keptPhone(value.dien_thoai);
    const code = value.ma || generatedCode(actionKey, n);
    const row: BatchCustomerRow = { n, ten: value.ten, loai: value.loai, dien_thoai: phone, dia_chi_giao: value.dia_chi_giao, email: value.email.toLowerCase(),
      ma_so_thue: value.ma_so_thue, ghi_chu: value.ghi_chu, code, status: "CREATE" };
    const skip = (reason: string): BatchCustomerRow => ({ ...row, status: "SKIP", reason });
    if (!parsed.success) return skip("Thông tin dòng này chưa đọc được");
    if (value.ten.length < 2) return skip("Thiếu tên khách");
    if (!CODE.test(code)) return skip("Mã khách chỉ gồm chữ in hoa, số, - hoặc _");
    if (row.email && !EMAIL.test(row.email)) return skip("Email chưa đúng");
    const key = phoneKey(phone);
    const sameCode = byCode.get(code);
    if (sameCode) return skip(`Đã có: ${sameCode.code} · ${sameCode.display_name}`);
    const samePhone = key ? byPhone.get(key) : undefined;
    if (samePhone) return skip(`Đã có: ${samePhone.code} · ${samePhone.display_name}`);
    const nameKey = value.ten.toLocaleLowerCase("vi").replace(/\s+/g, " ");
    const earlier = (key && seenPhone.get(key)) || seenCode.get(code) || (!key && seenName.get(nameKey));
    if (earlier) return skip(`Trùng dòng ${earlier}`);
    if (key) seenPhone.set(key, n);
    seenCode.set(code, n);
    seenName.set(nameKey, n);
    return row;
  });
}

async function rpc(context: AgentContext, name: string, args: Record<string, unknown>) {
  const { error } = await context.supabase.rpc(name, args);
  if (error) throw new Error(error.message);
}

function rowFailure(message: string): string {
  if (/23505|duplicate|unique/i.test(message)) return "mã khách đã có";
  if (/42501|forbidden/i.test(message)) return "không có quyền";
  return "chưa lưu được";
}

export const createCustomers: AgentAction = {
  kind: BATCH_CUSTOMERS_KIND, area: "Bán hàng", permissions: ["customers.manage"],
  description: `Soạn tạo NHIỀU khách hàng một lần (tối đa ${BATCH_CUSTOMERS_MAX}) từ danh sách người dùng gửi: file Excel/CSV hoặc ảnh chụp danh sách. Đưa mọi dòng đọc được, `
    + "không bỏ dòng nào, không bịa số điện thoại; hệ thống tự đánh dấu dòng trùng khách đã có hoặc trùng trong danh sách. Một khách lẻ thì dùng soan_tao_khach_hang.",
  properties: {
    khach: { type: "array", description: "Các khách theo thứ tự trong danh sách.", items: { type: "object", additionalProperties: false, required: ["ten"], properties: {
      ten: { type: "string", description: "Tên khách hoặc cửa hàng." }, loai: { type: "string", enum: ["BUSINESS", "INDIVIDUAL"], description: "Doanh nghiệp/cửa hàng hay cá nhân." },
      dien_thoai: { type: "string", description: "Điện thoại như trong danh sách; trống nếu không có." },
      dia_chi_giao: { type: "string", description: "Địa chỉ giao hàng; trống nếu không có." }, ma: { type: "string", description: "Mã khách nếu danh sách có; trống = tự đặt." },
      email: { type: "string", description: "Email nếu có." }, ma_so_thue: { type: "string", description: "Mã số thuế nếu có." }, ghi_chu: { type: "string", description: "Ghi chú khác của dòng (người liên hệ…)." },
    } } },
  },
  view(payload): ListView | null {
    const rows = payload.rows as BatchCustomerRow[] | undefined;
    if (!rows) return null;
    return { columns: ["Khách hàng", "Điện thoại", "Địa chỉ"], verb: "tạo", noun: "khách", okLabel: "Tạo",
      rows: rows.map((row) => ({ n: row.n, cells: [row.ten || "—", row.dien_thoai || "—", row.dia_chi_giao || "—"], status: row.status, ...(row.reason ? { reason: row.reason } : {}) })) };
  },
  async prepare(context, input) {
    const { khach } = inputSchema.parse(input);
    const { data, error } = await context.supabase.from("customers").select("code, display_name, phone").eq("branch_id", context.branchId).limit(20000);
    if (error) throw new ResolveError("Chưa đọc được danh sách khách hiện có. Thử lại.");
    const actionKey = crypto.randomUUID();
    const rows = checkRows(khach, (data ?? []) as Existing[], actionKey);
    const create = rows.filter((row) => row.status === "CREATE").length;
    if (!create) throw new ResolveError(`Không có khách mới để tạo: ${rows.map((row) => `dòng ${row.n} ${row.reason}`).join("; ")}.`);
    const skipped = rows.length - create;
    return { title: `Tạo ${create} khách hàng`, payload: { rows },
      summary: [{ label: "Sẽ tạo", value: `${create} khách` }, ...(skipped ? [{ label: "Bỏ qua", value: `${skipped} dòng (trùng hoặc thiếu tên)` }] : [])] };
  },
  async execute(context, payload, actionId, options) {
    const rows = ((payload.rows ?? []) as BatchCustomerRow[]).filter((row) => row.status === "CREATE" && !options?.exclude?.includes(row.n));
    if (!rows.length) throw new ResolveError("Chưa chọn khách nào để tạo.");
    const failed: string[] = [];
    let created = 0;
    for (const row of rows) {
      const customerId = derivedOperationId(actionId, `row:${row.n}`);
      try {
        await rpc(context, "save_customer_site_profile", { kind: "customers", target_id: customerId, target_branch_id: context.branchId,
          values_json: { code: row.code, display_name: row.ten, customer_type: row.loai, phone: row.dien_thoai || null, email: row.email || null, address_text: row.dia_chi_giao || null,
            tax_code: row.ma_so_thue || null, sales_owner_employee_id: null, payment_terms_days: "0", internal_note: row.ghi_chu || null, active: true },
          expected_json: null, change_reason: "Trợ lý AI tạo khách hàng từ danh sách", operation_id: customerId });
        if (row.dia_chi_giao) {
          const siteId = derivedOperationId(actionId, `row:${row.n}:site`);
          await rpc(context, "save_customer_site_profile", { kind: "sites", target_id: siteId, target_branch_id: context.branchId,
            values_json: { customer_id: customerId, code: "CT1", name: `Công trình ${row.ten.slice(0, 140)}`, address_text: row.dia_chi_giao, receiver_name: null,
              receiver_phone: row.dien_thoai || null, sales_owner_employee_id: null, access_note: null, active: true },
            expected_json: null, change_reason: "Trợ lý AI tạo công trình", operation_id: siteId });
        }
        created += 1;
      } catch (error) {
        failed.push(`dòng ${row.n} ${row.ten} (${rowFailure(error instanceof Error ? error.message : "")})`);
      }
    }
    const skipped = ((payload.rows ?? []) as BatchCustomerRow[]).length - rows.length;
    // A row that failed keeps the card waiting; confirming again replays the saved rows and retries only these.
    if (failed.length) throw new ResolveError(`Đã tạo ${created}/${rows.length} khách. Chưa tạo được: ${failed.slice(0, 10).join("; ")}${failed.length > 10 ? "…" : ""}. Sửa rồi bấm Xác nhận lại; khách đã tạo không bị tạo lại.`);
    return { link: "/admin/customers", message: `Đã tạo ${created} khách hàng${skipped ? `, bỏ qua ${skipped} dòng` : ""}.` };
  },
};
