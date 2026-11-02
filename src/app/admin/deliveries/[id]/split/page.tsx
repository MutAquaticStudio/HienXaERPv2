import Link from "next/link";
import { notFound } from "next/navigation";
import { SplitDeliveryForm } from "@/components/delivery/split-delivery-form";
import { requireInternalPermission } from "@/lib/access/context";
import { businessInputValue } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { listAssignmentEmployees } from "@/modules/delivery/assignment-options";
import { deliveryStateLabel, vehicleStatusLabel } from "@/modules/delivery/presentation";

type Props = { params: Promise<{ id: string }> };
type Line = { id: string; material_name_snapshot: string; source_mode: string; planned_base_quantity: string | number; base_uom_symbol: string };
type Vehicle = { vehicle_id: string; plate_number: string; capacity_quantity: string | null; capacity_symbol: string | null; busy_delivery_number: string | null; busy_state: string | null; busy_until: string | null };

/** D46 "Tách phiếu giao": share a note's lines out into 2–5 new notes before anything is loaded. */
export default async function SplitDeliveryPage({ params }: Props) {
  const access = await requireInternalPermission("delivery.assign");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [deliveryResult, lineResult, employeeResult, vehicleResult] = await Promise.all([
    supabase.from("delivery_read").select("id, sales_order_id, delivery_number, customer_name_snapshot, site_name_snapshot, execution_state, version, scheduled_at")
      .eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("delivery_line_read").select("id, material_name_snapshot, source_mode, planned_base_quantity, base_uom_symbol").eq("delivery_id", id).order("id"),
    listAssignmentEmployees(supabase, access.branchId),
    supabase.from("vehicle_status_read").select("vehicle_id, plate_number, capacity_quantity, capacity_symbol, busy_delivery_number, busy_state, busy_until")
      .eq("branch_id", access.branchId).order("plate_number"),
  ]);
  if (deliveryResult.error || lineResult.error) throw new Error("Không thể tải phiếu giao.");
  const delivery = deliveryResult.data;
  if (!delivery) notFound();
  const lines = (lineResult.data ?? []) as Line[];
  const canSplit = ["PLANNED", "ASSIGNED"].includes(delivery.execution_state) && lines.length > 0 && access.permissions.has("delivery.create");
  const isDirect = lines.length > 0 && lines.every((line) => line.source_mode === "SUPPLIER_DIRECT");

  return <>
    <header className="page-heading"><div><p className="eyebrow">Điều phối giao hàng</p><h1>Tách phiếu giao {delivery.delivery_number}</h1>
      <p className="lede">{delivery.customer_name_snapshot} · {delivery.site_name_snapshot}</p></div></header>
    {canSplit ? <>
      <SplitDeliveryForm intro={<section className="card card-pad">
        <p>Chia hàng của phiếu này cho 2–5 chuyến. Phiếu {delivery.delivery_number} sẽ được hủy, các phiếu mới ghi “Tách từ {delivery.delivery_number}”.</p>
        <p className="muted">Hàng giữ chỗ trong kho chuyển sang các phiếu mới trong cùng một lần ghi. Đơn bán, công nợ và mã thanh toán không đổi.
          {delivery.execution_state === "ASSIGNED" && " Phân công hiện tại sẽ được gỡ và người giao nhận thông báo."}</p>
      </section>} deliveryId={delivery.id} version={delivery.version} allowAssign={!isDirect}
        defaultStart={delivery.scheduled_at ? businessInputValue(delivery.scheduled_at) : ""}
        lines={lines.map((line) => ({ id: line.id, name: line.material_name_snapshot, planned: String(line.planned_base_quantity), unit: line.base_uom_symbol }))}
        employees={(employeeResult.data ?? []).map((employee) => ({ id: employee.id, label: employee.display_name }))}
        vehicles={((vehicleResult.data ?? []) as Vehicle[]).map((vehicle) => ({ id: vehicle.vehicle_id, label: `${vehicle.plate_number}${vehicleStatusLabel(vehicle)}` }))} />
    </> : <section className="card card-pad">
      <h2>Không tách được phiếu này</h2>
      <p>{!access.permissions.has("delivery.create") ? "Bạn cần quyền lập phiếu giao để tách phiếu."
        : `Phiếu đang ở trạng thái “${deliveryStateLabel(delivery.execution_state)}”. Chỉ tách được phiếu chưa lấy hàng lên xe.`}</p>
    </section>}
    <p><Link className="code-link" href={`/admin/deliveries/${delivery.id}`}>Về phiếu giao</Link> · <Link className="code-link" href={`/admin/orders/${delivery.sales_order_id}`}>Về đơn bán</Link></p>
  </>;
}
