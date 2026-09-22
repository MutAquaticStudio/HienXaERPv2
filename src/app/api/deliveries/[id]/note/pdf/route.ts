import { createServerSupabase } from "@/lib/supabase/server";
import { createStandardPdf, pdfResponse } from "@/lib/pdf/standard-document";

type Delivery = { id: string; delivery_number: string; execution_state: string; result_kind: string | null; customer_name_snapshot: string; site_name_snapshot: string; delivery_address_snapshot: string; receiver_name_snapshot: string | null; receiver_phone_snapshot: string | null; scheduled_at: string | null; verified_at: string | null };
type Line = { id: string; material_name_snapshot: string; source_mode: string; planned_base_quantity: string; actual_base_quantity: string; accepted_base_quantity: string; billable_base_quantity: string; base_uom_symbol: string };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Cần đăng nhập.", { status: 401 });
  const [deliveryResult, lineResult] = await Promise.all([
    supabase.from("delivery_read").select("id, delivery_number, execution_state, result_kind, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, receiver_name_snapshot, receiver_phone_snapshot, scheduled_at, verified_at").eq("id", id).maybeSingle(),
    supabase.from("delivery_line_read").select("id, material_name_snapshot, source_mode, planned_base_quantity, actual_base_quantity, accepted_base_quantity, billable_base_quantity, base_uom_symbol").eq("delivery_id", id).order("id"),
  ]);
  if (!deliveryResult.data || lineResult.error) return new Response("Không tìm thấy phiếu giao.", { status: 404 });
  const delivery = deliveryResult.data as Delivery;
  const lines = (lineResult.data ?? []) as Line[];
  const generatedAt = new Date().toISOString();
  const bytes = await createStandardPdf({
    title: "PHIẾU GIAO HÀNG",
    reference: delivery.delivery_number,
    subtitle: `${delivery.execution_state}${delivery.result_kind ? ` / ${delivery.result_kind}` : ""}`,
    fields: [
      { label: "Khách hàng", value: delivery.customer_name_snapshot },
      { label: "Công trình", value: delivery.site_name_snapshot },
      { label: "Địa chỉ giao", value: delivery.delivery_address_snapshot },
      { label: "Người nhận", value: `${delivery.receiver_name_snapshot ?? "Chưa ghi nhận"}${delivery.receiver_phone_snapshot ? ` - ${delivery.receiver_phone_snapshot}` : ""}` },
      { label: "Lịch giao", value: delivery.scheduled_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.scheduled_at)) : "Chưa hẹn" },
      { label: "Xác minh", value: delivery.verified_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(delivery.verified_at)) : "Chưa xác minh" },
    ],
    columns: [
      { label: "Vật tư", key: "material", width: 174 },
      { label: "Nguồn", key: "source", width: 88 },
      { label: "Kế hoạch", key: "planned", width: 83, align: "right" },
      { label: "Thực tế", key: "actual", width: 83, align: "right" },
      { label: "Khách nhận", key: "accepted", width: 83, align: "right" },
    ],
    rows: lines.map((line) => ({ material: line.material_name_snapshot, source: line.source_mode, planned: `${line.planned_base_quantity} ${line.base_uom_symbol}`, actual: `${line.actual_base_quantity} ${line.base_uom_symbol}`, accepted: `${line.accepted_base_quantity} ${line.base_uom_symbol}` })),
    trace: `Source delivery_id=${delivery.id}; generated_at=${generatedAt}; state=${delivery.execution_state}`,
    disclaimer: "Phiếu giao hàng - không phải hóa đơn thuế.",
  });
  return pdfResponse(bytes, `${delivery.delivery_number}-delivery-note.pdf`);
}
