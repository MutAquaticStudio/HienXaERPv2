import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import "@/components/astryx/fin-kit.css";

/**
 * Phiếu giao kiểu Astryx: đầu trang (số phiếu, trạng thái thực thi, kết quả, tải phiếu, mở đơn bán) dựng lại;
 * toàn bộ phần thao tác bên dưới (phân giao, bàn giao, báo kết quả, xác minh, hồ sơ trả hàng...) là biểu mẫu có server action
 * của Classic, giữ nguyên để không làm hỏng nghiệp vụ (IMPL.md mục 4).
 */
export function AstryxDeliveryDetailView({ number, customer, site, orderId, deliveryId, stateLabel, stateTone, resultLabel, sourceLabels, canSplit, cancellable, children }: {
  number: string; customer: string; site: string; orderId: string; deliveryId: string; stateLabel: string; stateTone: "success" | "warning" | "info" | "danger"; resultLabel: string | null;
  sourceLabels: string[]; canSplit: boolean; cancellable: boolean; children: ReactNode;
}) {
  return <>
    <AxPageHead crumbs={["Giao hàng", "Phiếu giao", number]} title={number}
      actions={<><a className="hx-btn" href={`/api/deliveries/${deliveryId}/note/pdf`}>Tải phiếu giao</a>
        <AxButtonLink href={`/admin/orders/${orderId}`}>Mở đơn bán</AxButtonLink>
        {canSplit && <AxButtonLink href={`/admin/deliveries/${deliveryId}/split`}>Tách phiếu</AxButtonLink>}
        {cancellable && <AxButtonLink href={`/admin/deliveries/${deliveryId}/cancel`}>Hủy kế hoạch</AxButtonLink>}
        <AxButtonLink href="/admin/deliveries">Về danh sách</AxButtonLink></>} />
    <div className="hx-card hx-pad" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 16 }} aria-label="Tóm tắt phiếu giao">
      <div style={{ flex: 1, minWidth: 220 }}><b style={{ fontSize: 17 }}>{customer}</b><div className="hx-muted">{site}</div></div>
      <div><div className="hx-label">Thực thi</div><AxStatus tone={toneOf(stateTone)}>{stateLabel}</AxStatus></div>
      <div><div className="hx-label">Kết quả</div><b>{resultLabel ?? "Chưa có"}</b></div>
      {sourceLabels.length > 0 && <div><div className="hx-label">Nguồn hàng</div><b>{sourceLabels.join(" · ")}</b></div>}
    </div>
    <div style={{ display: "grid", gap: 16 }}>{children}</div>
  </>;
}
