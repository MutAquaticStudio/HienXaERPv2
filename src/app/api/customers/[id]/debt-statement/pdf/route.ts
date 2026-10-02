import { createServerSupabase } from "@/lib/supabase/server";
import { createStandardPdf, pdfResponse } from "@/lib/pdf/standard-document";

type Obligation = { obligation_id: string; party_name: string; site_name: string | null; source_type: string; source_id: string; due_date: string; outstanding_amount_vnd: string };
const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} VND`;
const sourceLabel = (value: string) => ({
  OPENING_BALANCE: "Số dư đầu kỳ",
  DELIVERY_VERIFICATION: "Giao hàng",
  SERVICE_VERIFICATION: "Dịch vụ",
} as Record<string, string>)[value] ?? value.replaceAll("_", " ").toLowerCase();

function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Cần đăng nhập.", { status: 401 });
  const requested = new URL(request.url).searchParams.get("asOf") ?? "";
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : localDate();
  const cutoff = new Date().toISOString();
  const customerResult = await supabase.from("customers").select("id, branch_id, display_name").eq("id", id).maybeSingle();
  if (!customerResult.data) return new Response("Không tìm thấy khách hàng.", { status: 404 });
  const obligations: Obligation[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.rpc("finance_obligation_snapshot", {
      target_branch_id: customerResult.data.branch_id,
      target_side: "AR",
      as_of: `${asOf}T23:59:59.999+07:00`,
      knowledge_cutoff: cutoff,
      target_customer_id: id,
      target_site_id: null,
      target_sales_employee_id: null,
    }).gt("outstanding_amount_vnd", 0).order("due_date").order("obligation_id").range(offset, offset + pageSize - 1);
    if (error) return new Response("Không thể tạo bảng đối chiếu.", { status: 403 });
    const page = (data ?? []) as Obligation[];
    obligations.push(...page);
    if (page.length < pageSize) break;
  }
  const total = obligations.reduce((sum, row) => sum + BigInt(row.outstanding_amount_vnd), 0n);
  const bytes = await createStandardPdf({
    title: "BẢNG ĐỐI CHIẾU CÔNG NỢ",
    reference: `AR-${customerResult.data.id.slice(0, 8)}-${asOf.replaceAll("-", "")}`,
    subtitle: `Số dư đến hết ${new Intl.DateTimeFormat("vi-VN").format(new Date(`${asOf}T12:00:00+07:00`))}`,
    fields: [
      { label: "Khách hàng", value: customerResult.data.display_name },
      { label: "Ngày đối chiếu", value: new Intl.DateTimeFormat("vi-VN").format(new Date(`${asOf}T12:00:00+07:00`)) },
      { label: "Phạm vi", value: "Toàn bộ công trình của khách hàng" },
      { label: "Dữ liệu ghi nhận đến", value: new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(cutoff)) },
    ],
    columns: [
      { label: "Công trình", key: "site", width: 130 },
      { label: "Nguồn", key: "source", width: 178 },
      { label: "Hạn", key: "due", width: 83 },
      { label: "Còn nợ", key: "amount", width: 120, align: "right" },
    ],
    rows: obligations.map((row) => ({ site: row.site_name ?? "Chưa gắn công trình", source: `${sourceLabel(row.source_type)} ${row.source_id}`, due: new Intl.DateTimeFormat("vi-VN").format(new Date(row.due_date)), amount: money(row.outstanding_amount_vnd) })),
    totals: [{ label: "Tổng còn phải thu", value: money(total.toString()) }],
    trace: `Source customer_id=${customerResult.data.id}; as_of=${asOf}; cutoff=${cutoff}; obligation_count=${obligations.length}`,
    disclaimer: "Bảng đối chiếu công nợ - không phải hóa đơn thuế.",
  });
  return pdfResponse(bytes, `debt-reconciliation-${customerResult.data.id.slice(0, 8)}-${asOf}.pdf`);
}
