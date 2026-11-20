import Link from "next/link";
import { AstryxDeliveryFlowView } from "../../astryx-view";
import { AxCard } from "@/components/astryx/fin-kit";
import { currentSkin } from "@/lib/skin";
import { notFound } from "next/navigation";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { cancelPlannedDeliveryAction } from "@/modules/delivery/cancel-planned-action";
import { Breadcrumb } from "@/components/ui/breadcrumb";

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

  // Kiểu giao diện Astryx: khung dựng lại; cùng action hủy kế hoạch, cùng quy tắc trạng thái.
  if ((await currentSkin()) === "astryx") {
    const cancellable = ["PLANNED", "ASSIGNED"].includes(delivery.execution_state);
    return <AstryxDeliveryFlowView number={delivery.delivery_number} title="Hủy kế hoạch giao hàng" subtitle={`${delivery.delivery_number} · ${delivery.customer_name_snapshot} · ${delivery.site_name_snapshot}`} orderId={delivery.sales_order_id} deliveryId={delivery.id}>
      {!cancellable ? <AxCard title={delivery.execution_state === "CANCELLED" ? "Phiếu đã hủy" : "Không thể hủy phiếu này"}>
        <p style={{ margin: 0 }}>{delivery.execution_state === "CANCELLED" && query.notice === "cancelled"
          ? "Tồn đặt trước đã được giải phóng. Lịch sử phiếu vẫn được giữ lại."
          : "Chỉ phiếu chưa lên hàng (đang lập hoặc đã phân, thợ chưa bắt đầu việc) mới được hủy."}</p></AxCard>
        : <AxCard title="Xác nhận hủy phiếu chưa thực thi">
          <p style={{ marginTop: 0 }}>Thao tác này giữ lịch sử phiếu, giải phóng tồn đã đặt trước và cho phép lập phiếu giao thay thế từ cùng nguồn. Không hủy đơn bán hay công nợ.</p>
          {delivery.execution_state === "ASSIGNED" && <p>Phiếu đã phân người/xe: hủy sẽ gỡ phân công, việc của thợ chuyển Đã hủy và rời “Nhận việc”, thông báo chưa gửi về phiếu này không gửi nữa. Thợ đã bắt đầu việc hoặc đã lên hàng thì không hủy được.</p>}
          {query.error && <p role="alert" className="hx-neg">{query.error === "invalid" ? "Phiếu giao đã thay đổi hoặc ghi chú quá 500 ký tự. Tải lại trang rồi thử lại." : query.error}</p>}
          <form action={cancelPlannedDeliveryAction} style={{ display: "grid", gap: 12 }}>
            <input type="hidden" name="deliveryId" value={delivery.id} />
            <input type="hidden" name="version" value={delivery.version} />
            <input type="hidden" name="operationId" value={crypto.randomUUID()} />
            <label className="hx-label">Ghi chú (không bắt buộc)<textarea className="hx-in" name="reason" maxLength={500} placeholder="Ví dụ: Khách dời ngày nhận" style={{ width: "100%", padding: 12 }} /></label>
            <div><button className="hx-btn d" type="submit">Xác nhận hủy kế hoạch</button></div>
          </form></AxCard>}
    </AstryxDeliveryFlowView>;
  }
  return <>
    <header className="page-heading"><div><Breadcrumb parent={{ href: "/admin/deliveries", label: "Phiếu giao" }} /><h1>Hủy kế hoạch giao hàng</h1><p className="lede">{delivery.delivery_number} · {delivery.customer_name_snapshot} · {delivery.site_name_snapshot}</p></div></header>
    <section className="card">
      {!["PLANNED", "ASSIGNED"].includes(delivery.execution_state) ? <>
        <h2>{delivery.execution_state === "CANCELLED" ? "Phiếu đã hủy" : "Không thể hủy phiếu này"}</h2>
        <p>{delivery.execution_state === "CANCELLED" && query.notice === "cancelled"
          ? "Tồn đặt trước đã được giải phóng. Lịch sử phiếu vẫn được giữ lại."
          : "Chỉ phiếu chưa lên hàng (đang lập hoặc đã phân, thợ chưa bắt đầu việc) mới được hủy."}</p>
      </> : <>
        <h2>Xác nhận hủy phiếu chưa thực thi</h2>
        <p>Thao tác này giữ lịch sử phiếu, giải phóng tồn đã đặt trước và cho phép lập phiếu giao thay thế từ cùng nguồn. Không hủy đơn bán hay công nợ.</p>
        {delivery.execution_state === "ASSIGNED" && <p>Phiếu đã phân người/xe: hủy sẽ gỡ phân công, việc của thợ chuyển Đã hủy và rời “Nhận việc”, thông báo chưa gửi về phiếu này không gửi nữa. Thợ đã bắt đầu việc hoặc đã lên hàng thì không hủy được.</p>}
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
