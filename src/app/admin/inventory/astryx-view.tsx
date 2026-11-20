import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxStatus } from "@/components/astryx/ax-kit";
import { AxField, AxFilters, AxSelectField } from "@/components/astryx/buystock-kit";
import { ListPager } from "@/components/ui/list-pager";

export type AxQty = { main: string; sub?: string };
export type AxStockRow = {
  id: string; name: string; code: string; group: string; href: string; opened: boolean;
  onHand: AxQty; reserved: AxQty; promised: AxQty; available: AxQty; value: string | null;
  lowCount: number; thresholdText: string | null; thresholdNode: ReactNode; purchaseHref: string | null;
  perWarehouse: { key: string; name: string; text: string }[]; hasReserved: boolean;
  card: { id: string; at: string; type: string; where: string | null; delta: string; positive: boolean; balance: string; deliveryId: string | null }[]; cardFull: boolean;
};

const Qty = ({ q }: { q: AxQty }) => <>{q.main}{q.sub && <small className="bs-sub">{q.sub}</small>}</>;

/** Tồn kho kiểu Astryx (chỉ đọc): cùng số liệu như Classic — Tồn kho, Chờ xuất giao, Đã hứa cho đơn, Có thể bán (in đậm), mỗi số kèm đơn vị riêng. */
export function AstryxInventoryView({ rows, kpis, filters, canCost, canCount, canManageWarehouses, total, page, params, scopeLabel, capped, limit, notice, error, filtered, warehouses, groups }: {
  rows: AxStockRow[]; kpis: { inStock: number; out: number; low: number; value: string; hrefIn: string; hrefOut: string; hrefLow: string };
  filters: { q: string; warehouse: string; group: string; stock: string; large: boolean; only: string };
  canCost: boolean; canCount: boolean; canManageWarehouses: boolean; total: number; page: number; params: Record<string, string | undefined>; scopeLabel: string; capped: boolean; limit: number;
  notice?: string; error?: string; filtered: boolean; warehouses: { id: string; name: string }[]; groups: { id: string; name: string }[];
}) {
  const columns = 6 + (canCost ? 1 : 0);
  return <>
    <AxPageHead crumbs={["Kho hàng", "Tồn kho"]} title="Tồn kho"
      actions={<><AxButtonLink href="/admin/inventory/transfers">Chuyển kho</AxButtonLink>{canManageWarehouses && <AxButtonLink href="/admin/inventory/warehouses">Quản lý kho</AxButtonLink>}<AxButtonLink href="/admin/stock-counts" kind={canCount ? "primary" : "secondary"}>Kiểm kho</AxButtonLink></>} />
    <p className="hx-muted" style={{ margin: "-8px 0 16px" }}>Có thể bán = Tồn kho − Chờ xuất giao (đã lên phiếu giao, chưa lấy lên xe) − Đã hứa cho đơn (đơn đã xác nhận lấy từ kho, chưa lập phiếu giao). Bấm tên vật tư để xem thẻ kho.</p>
    {notice === "threshold-saved" && <p className="form-message success" role="status">Đã lưu ngưỡng cảnh báo.</p>}
    {error && <p className="form-message" role="alert">Không thể lưu ngưỡng. Kiểm tra kho, vật tư và số lượng rồi thử lại.</p>}
    <section className="bs-facts" aria-label="Tổng quan tồn kho">
      <Link className="hx-card bs-fact" href={kpis.hrefIn}><span className="hx-label">Vật tư còn hàng</span><b>{kpis.inStock}</b></Link>
      <Link className="hx-card bs-fact" href={kpis.hrefOut}><span className="hx-label">Hết hàng</span><b>{kpis.out}</b></Link>
      <Link className="hx-card bs-fact" href={kpis.hrefLow}><span className="hx-label">Dưới ngưỡng</span><b className={kpis.low ? "hx-neg" : undefined}>{kpis.low}</b></Link>
      <div className="hx-card bs-fact"><span className="hx-label">Giá trị tồn</span><b>{kpis.value}</b></div>
    </section>
    <div className="bs-layout">
      <div className="hx-side">
        <AxFilters action="/admin/inventory" label="Bộ lọc tồn kho" showClear={filtered} clearHref="/admin/inventory">
          <AxField label="Tìm kiếm" name="q" type="search" defaultValue={filters.q} placeholder="Mã hoặc tên vật tư" />
          <AxSelectField label="Kho" name="warehouse" defaultValue={filters.warehouse} options={[{ value: "", label: "Tất cả kho" }, ...warehouses.map((row) => ({ value: row.id, label: row.name }))]} />
          <AxSelectField label="Nhóm vật tư" name="group" defaultValue={filters.group} options={[{ value: "", label: "Tất cả" }, ...groups.map((row) => ({ value: row.id, label: row.name }))]} />
          <AxSelectField label="Tồn kho" name="stock" defaultValue={filters.stock} options={[{ value: "", label: "Tất cả" }, { value: "in", label: "Còn hàng" }, { value: "out", label: "Hết hàng" }, { value: "low", label: "Dưới ngưỡng" }]} />
          <AxSelectField label="Hiển thị theo" name="unit" defaultValue={filters.large ? "large" : ""} options={[{ value: "", label: "Đơn vị cơ sở" }, { value: "large", label: "Đơn vị lớn nhất (tấn, bao…)" }]} />
          {filters.only && <input type="hidden" name="material" value={filters.only} />}
        </AxFilters>
      </div>
      <div className="bs-main">
        <div className="hx-ch" style={{ padding: "0 0 12px" }}><b className="hx-sec">{total} vật tư</b><span className="hx-muted">{scopeLabel}</span></div>
        {capped && <p className="hx-muted">Đang xem {limit} vật tư đầu tiên; thu hẹp bằng tìm kiếm hoặc nhóm.</p>}
        <div className="hx-card bs-panel"><div className="bs-scroll"><table className="bs-table" aria-label="Tồn kho theo vật tư">
          <thead><tr><th scope="col">Vật tư</th><th scope="col" className="hx-num">Tồn kho</th><th scope="col" className="hx-num" title="Đã lên phiếu giao, chưa lấy lên xe">Chờ xuất giao</th><th scope="col" className="hx-num" title="Đơn đã xác nhận lấy từ kho, chưa lập phiếu giao">Đã hứa cho đơn</th><th scope="col" className="hx-num">Có thể bán</th>
            {canCost && <th scope="col" className="hx-num">Giá trị tồn</th>}<th scope="col">Ngưỡng</th></tr></thead>
          <tbody>{rows.flatMap((row) => [
            <tr key={row.id}>
              <td><Link href={row.href} scroll={false} aria-expanded={row.opened}><b>{row.name}</b></Link><small className="bs-sub">{row.code} · {row.group}</small></td>
              <td className="hx-num"><Qty q={row.onHand} /></td>
              <td className="hx-num"><Qty q={row.reserved} /></td>
              <td className="hx-num"><Qty q={row.promised} /></td>
              <td className="hx-num"><b><Qty q={row.available} /></b></td>
              {canCost && <td className="hx-num">{row.value ?? "—"}</td>}
              <td><div className="bs-inline">{row.lowCount ? <AxStatus tone="warning">{`Dưới ngưỡng${filters.warehouse ? "" : ` · ${row.lowCount} kho`}`}</AxStatus> : row.thresholdText ? <span className="hx-muted">{row.thresholdText}</span> : <span className="hx-muted">—</span>}
                {row.thresholdNode}{row.lowCount > 0 && row.purchaseHref && <Link className="hx-code" href={row.purchaseHref}>Đặt mua</Link>}</div></td>
            </tr>,
            row.opened && <tr key={`${row.id}-card`}><td colSpan={columns} style={{ background: "#F4F9FE" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 24 }}>
                <section><h4 className="hx-label">Tồn theo kho</h4>{row.perWarehouse.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{row.perWarehouse.map((item) => <li key={item.key}><b>{item.name}</b><small className="bs-sub">{item.text}</small></li>)}</ul> : <p className="hx-muted" style={{ margin: 0 }}>Chưa có tồn ở kho nào.</p>}
                  <p style={{ margin: "8px 0 0" }}><Link className="hx-code" href={`/admin/products/${row.id}`}>Mở vật tư</Link>{row.hasReserved && <> · <Link className="hx-code" href="/admin/dispatch">Xem phiếu giao đang chờ xuất</Link></>}</p></section>
                <section><h4 className="hx-label">Thẻ kho{filters.warehouse ? ` · ${scopeLabel}` : ""}</h4>{row.card.length ? <table className="bs-table" aria-label={`Thẻ kho ${row.name}`}>
                  <thead><tr><th scope="col">Thời điểm</th><th scope="col">Loại</th>{!filters.warehouse && <th scope="col">Vị trí</th>}<th scope="col" className="hx-num">Nhập / xuất</th><th scope="col" className="hx-num">Tồn sau</th><th scope="col">Chứng từ</th></tr></thead>
                  <tbody>{row.card.map((move) => <tr key={move.id}><td>{move.at}</td><td>{move.type}</td>{!filters.warehouse && <td>{move.where}</td>}
                    <td className={`hx-num${move.positive ? " hx-pos" : ""}`}>{move.delta}</td><td className="hx-num">{move.balance}</td>
                    <td>{move.deliveryId ? <Link className="hx-code" href={`/admin/deliveries/${move.deliveryId}`}>Phiếu giao</Link> : "Chứng từ kho"}</td></tr>)}</tbody></table> : <p className="hx-muted" style={{ margin: 0 }}>Chưa có phát sinh kho.</p>}
                  {row.cardFull && <p className="hx-muted">50 phát sinh gần nhất.</p>}</section>
              </div></td></tr>,
          ])}</tbody>
        </table></div>
          {rows.length === 0 && <div className="hx-empty" role="status"><p>{filtered ? "Không có vật tư phù hợp bộ lọc." : "Chưa có vật tư đang dùng."}</p></div>}</div>
        <ListPager page={page} total={total} params={params} />
      </div>
    </div>
  </>;
}
