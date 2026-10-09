import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatVnd, vnd } from "@/lib/core/money";
import { loadMaterialDetail } from "@/modules/catalog/material-detail";
import { catalogHref } from "@/modules/catalog/ownership";

function priceState(active: boolean, from: string, to: string | null, now: number) {
  if (!active) return "Đã ngừng";
  if (Date.parse(from) > now) return "Chưa hiệu lực";
  if (to && Date.parse(to) <= now) return "Hết hiệu lực";
  return "Đang hiệu lực";
}
function date(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }

export default async function MaterialDetailPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  const detail = await loadMaterialDetail(id);
  if (!detail) notFound();
  const { access, material, capabilities } = detail;
  const symbols = new Map(detail.units.map(unit => [unit.id, unit.symbol]));
  const warehouses = new Map(detail.warehouses.map(warehouse => [warehouse.id, warehouse.name + (warehouse.active ? "" : " (ngừng)")]));
  const suppliers = new Map(detail.suppliers.map(supplier => [supplier.id, supplier.name]));
  const unit = (id: string) => symbols.get(id) ?? id;
  const now = detail.asOf;
  return <>
    <header className="page-heading"><div><p className="eyebrow">Vật tư · {material.code} · {access.branchName}</p><h1>{material.name}</h1><p className="lede">{material.specification ?? "Chưa có quy cách"}</p></div><div className="form-actions"><Link className="button button-secondary" href="/admin/products">Danh sách vật tư</Link>{access.permissions.has("catalog.manage") && <Link className="button button-secondary" href={catalogHref("materials", { id })}>Sửa vật tư</Link>}<StatusBadge tone={material.active ? "success" : "danger"}>{material.active ? "Đang dùng" : "Ngừng dùng"}</StatusBadge></div></header>
    <section className="card card-pad"><h2>Thông tin vật tư</h2><dl className="detail-grid"><div className="detail-item"><dt>Nhóm</dt><dd>{detail.groupName}</dd></div><div className="detail-item"><dt>Đơn vị cơ sở</dt><dd>{unit(material.base_uom_id)}</dd></div><div className="detail-item"><dt>Phạm vi sử dụng</dt><dd>{[material.sale_enabled && "Bán", material.purchase_enabled && "Mua"].filter(Boolean).join(" · ")}</dd></div></dl></section>
    <section className="card card-pad"><h2>Đơn vị & quy đổi</h2><div className="table-wrap"><table><thead><tr><th>Đơn vị</th><th>Tỷ lệ chính xác</th><th>Loại / làm tròn</th><th>Thanh toán</th><th>Trạng thái</th></tr></thead><tbody>{detail.conversions.map(row => <tr key={row.id}><td>{unit(row.from_uom_id)} → {unit(row.to_uom_id)}</td><td className="mono">{row.numerator} / {row.denominator}</td><td>{row.conversion_type} · {row.rounding_mode}, {row.rounding_scale} số lẻ</td><td>{row.settlement_allowed ? "Được phép" : "Chỉ lập kế hoạch"}</td><td>{row.active ? "Đang dùng" : "Đã ngừng"}</td></tr>)}</tbody></table></div>{!detail.conversions.length && <p className="empty-inline">Chưa có quy đổi liên quan. Không tự suy ra hệ số.</p>}</section>
    <section className="card card-pad"><div className="section-head flush"><h2>Tham chiếu giá bán</h2>{capabilities.salesPrice && <Link className="code-link" href="/admin/products/pricing">Bảng giá</Link>}</div>{capabilities.salesPrice ? <><div className="table-wrap"><table><thead><tr><th>Phạm vi</th><th>Giá / đơn vị</th><th>Nguồn / phiên bản</th><th>Hiệu lực</th></tr></thead><tbody>{detail.salesPrices.map(row => <tr key={row.id}><td>{row.scope_type}{row.customer_id ? ` · Khách ${row.customer_id}` : row.customer_tier_code ? ` · Nhóm ${row.customer_tier_code}` : ""}</td><td>{formatVnd(vnd(row.unit_price_vnd))} / {unit(row.price_uom_id)}</td><td>{row.source_type} · v{row.version}</td><td>{priceState(row.active, row.effective_from, row.effective_to, now)} · {date(row.effective_from)}{row.effective_to ? ` đến trước ${date(row.effective_to)}` : ""}</td></tr>)}</tbody></table></div>{!detail.salesPrices.length && <p className="empty-inline">Chưa có giá tham chiếu cho vật tư/nhóm này; không mặc định bằng 0.</p>}<p className="muted">Đây là tham chiếu. Giá trên chứng từ được engine chọn theo khách hàng, đơn vị và thời điểm rồi lưu snapshot; trang này không đổi chứng từ.</p></> : <p className="muted">Không có quyền xem bảng giá.</p>}</section>
    <section className="card card-pad"><h2>Giá mua theo nhà cung cấp</h2>{capabilities.purchasePrice ? <div className="table-wrap"><table><thead><tr><th>Nhà cung cấp</th><th>Giá mua / đơn vị</th><th>Nguồn / phiên bản</th><th>Hiệu lực</th></tr></thead><tbody>{detail.purchasePrices.map(row => <tr key={row.id}><td>{suppliers.get(row.supplier_id) ?? row.supplier_id}</td><td>{formatVnd(vnd(row.unit_cost_vnd))} / {unit(row.purchase_uom_id)}</td><td>{row.source_type} · v{row.version}</td><td>{priceState(row.active, row.effective_from, row.effective_to, now)}</td></tr>)}</tbody></table>{!detail.purchasePrices.length && <p className="empty-inline">Chưa có giá mua cho vật tư này trong chi nhánh.</p>}</div> : <p className="muted">Giá mua được ẩn theo quyền; không tải dữ liệu giá vốn về client.</p>}</section>
    <section className="card card-pad"><h2>Tồn kho tại {access.branchName}</h2>{capabilities.inventory ? <><div className="table-wrap"><table><thead><tr><th>Kho</th><th>Thực tế</th><th>Đã giữ</th><th>Khả dụng</th><th>Chi tiết</th></tr></thead><tbody>{detail.positions.map(row => <tr key={row.warehouse_id}><td>{warehouses.get(row.warehouse_id) ?? row.warehouse_id}</td><td>{row.on_hand_base_quantity} {unit(row.base_uom_id)}</td><td>{row.reserved_base_quantity} {unit(row.base_uom_id)}</td><td>{row.available_base_quantity} {unit(row.base_uom_id)}</td><td><Link className="code-link" href={`/admin/inventory?warehouse=${row.warehouse_id}&material=${id}`}>Biến động / giữ chỗ</Link></td></tr>)}</tbody></table></div>{!detail.positions.length && <p className="empty-inline">Chưa có số dư kho được ghi nhận. Không coi đây là số dư đầu kỳ 0 đã được duyệt.</p>}<p className="muted">Số lượng theo ĐVT cơ sở từng vật tư. Giữ chỗ chỉ giảm khả dụng; xác nhận SO không tự trừ kho.</p></> : <p className="muted">Không có quyền xem tồn kho.</p>}</section>
  </>;
}
