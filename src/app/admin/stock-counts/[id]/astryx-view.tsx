import type { ReactNode } from "react";
import { ActionNotice } from "@/components/sales/action-notice";
import { AxButtonLink, AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxBanner } from "@/components/astryx/sales-kit";

/** Phiếu kiểm kho kiểu Astryx. Bảng nhập số đếm, lưu, cân bằng, hủy là thành phần Classic `StockCountSheet` giữ nguyên (`sheet`). */
export function AstryxStockCountDetail({ number, warehouse, cutoff, approvedAt, state, stateLabel, tone, sheet, notice, error }: {
  number: string; warehouse: string; cutoff: string; approvedAt: string | null; state: string; stateLabel: string; tone: "success" | "warning" | "info" | "danger"; sheet: ReactNode; notice?: string; error?: string;
}) {
  return <>
    <AxPageHead crumbs={["Kho hàng", "Kiểm kho", number]} title={number} actions={<><AxStatus tone={tone}>{stateLabel}</AxStatus><AxButtonLink href="/admin/stock-counts">Về danh sách</AxButtonLink></>} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>{warehouse} · chốt sổ lúc {cutoff}{approvedAt && ` · cân bằng lúc ${approvedAt}`}</p>
    <ActionNotice notice={notice} error={error} />
    {state === "OPEN" && <div style={{ marginBottom: 16 }}><AxBanner status="info" title="Đang kiểm" description="Nhập số thực tế theo đơn vị cơ sở. Vật tư chưa đếm không bị điều chỉnh. Nếu kho có nhập/xuất sau lúc chốt sổ, dòng của vật tư đó phải kiểm lại ở phiếu mới." /></div>}
    {state === "CANCELLED" && <div style={{ marginBottom: 16 }}><AxBanner status="warning" title="Phiếu đã hủy" description="Tồn kho không thay đổi. Số đã đếm dưới đây chỉ để tra cứu." /></div>}
    {state === "APPROVED" && <div style={{ marginBottom: 16 }}><AxBanner status="success" title="Đã cân bằng kho" description="Đã cân bằng kho theo các dòng dưới đây. Mọi điều chỉnh tiếp theo phải qua phiếu kiểm mới." /></div>}
    {sheet}
  </>;
}
