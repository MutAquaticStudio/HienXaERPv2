import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { cancelPlannedDeliveryAction } from "@/modules/delivery/cancel-planned-action";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function CancelPlannedDeliveryPage({ params, searchParams }: Props) {
  const access = await requireInternalPermission("delivery.exception");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createServerSupabase();
  const { data: delivery, error } = await supabase.from("delivery_read")
    .select("id, sales_order_id, delivery_number, customer_name_snapshot, site_name_snapshot, execution_state, version")
    .eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (error) throw new Error("Không thể tải phiếu giao.");
  if (!delivery) notFound();

  return <>
    <header className="page-heading"><div><p className="eyebrow">Thực hiện đơn</p><h1>Hủy kế hoạch giao hàng</h1><p className="lede">{delivery.delivery_number} · {delivery.customer_name_snapshot} · {delivery.site_name_snapshot}</p></div></header>
    <section className="card">
      {delivery.execution_state !== "PLANNED" ? <>
        <h2>{delivery.execution_state === "CANCELLED" ? "Phiếu đã hủy" : "Không thể hủy phiếu này"}</h2>
        <p>{delivery.execution_state === "CANCELLED" && query.notice === "cancelled"
          ? "Tồn đặt trước đã được giải phóng. Lịch sử phiếu vẫn được giữ lại."
          : "Chỉ phiếu chưa phân công, chưa bắt đầu thực thi và còn ở trạng thái kế hoạch mới được hủy."}</p>
      </> : <>
        <h2>Xác nhận hủy phiếu chưa thực thi</h2>
        <p>Thao tác này giữ lịch sử phiếu, giải phóng tồn đã đặt trước và cho phép lập phiếu giao thay thế từ cùng nguồn. Không hủy đơn bán hay công nợ.</p>
        {query.error && <p role="alert">{query.error === "invalid" ? "Phiếu giao đã thay đổi hoặc ghi chú quá 500 ký tự. Tải lại trang rồi thử lại." : query.error}</p>}
        <form action={cancelPlannedDeliveryAction}>
          <input type="hidden" name="deliveryId" value={delivery.id} />
          <input type="hidden" name="version" value={delivery.version} />
          <input type="hidden" name="operationId" value={crypto.randomUUID()} />
          <label>Ghi chú (không bắt buộc)<textarea name="reason" maxLength={500} placeholder="Ví dụ: Khách dời ngày nhận" /></label>
          <button className="button" type="submit">Xác nhận hủy kế hoạch</button>
        </form>
      </>}
      <p><Link className="code-link" href={`/admin/deliveries/${delivery.id}`}>Về phiếu giao</Link> · <Link className="code-link" href={`/admin/orders/${delivery.sales_order_id}`}>Về đơn bán</Link></p>
    </section>
  </>;
}
