import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

type MaterialRow = { id: string; code: string; name: string; specification: string | null; sale_enabled: boolean; purchase_enabled: boolean; active: boolean; material_groups: { name: string } | { name: string }[] | null; units_of_measure: { symbol: string } | { symbol: string }[] | null };
function one<T>(relation: T | T[] | null): T | null { return Array.isArray(relation) ? relation[0] ?? null : relation; }

export default async function ProductsPage() {
  const access = await requireInternalPermission("catalog.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("materials").select("id, code, name, specification, sale_enabled, purchase_enabled, active, material_groups(name), units_of_measure:base_uom_id(symbol)").order("name");
  if (error) throw new Error("Không thể tải danh mục vật tư.");
  const materials = data as unknown as MaterialRow[];
  return <><header className="page-heading"><div><p className="eyebrow">Danh mục</p><h1>Vật tư & quy cách</h1>{access.permissions.has("catalog.manage") && <div className="form-actions"><Link className="button button-secondary" href="/admin/products/manage?kind=materials">Thêm / sửa vật tư</Link><Link className="button button-secondary" href="/admin/products/manage?kind=groups">Nhóm vật tư</Link><Link className="button button-secondary" href="/admin/products/manage?kind=units">Đơn vị tính</Link><Link className="button button-secondary" href="/admin/products/manage?kind=conversions">Quy đổi</Link></div>}{access.permissions.has("pricing.read") && <Link className="button button-secondary" href="/admin/products/pricing">Giá bán</Link>}<p className="lede">Đơn vị giao dịch lấy từ danh mục và conversion theo vật tư, không nhập free text.</p></div></header><section className="card"><div className="section-head"><h2>{materials.length} vật tư</h2></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Vật tư</th><th>Nhóm</th><th>Đơn vị gốc</th><th>Cho phép</th><th>Trạng thái</th></tr></thead><tbody>{materials.map((material) => <tr key={material.id}><td className="mono">{material.code}</td><td><Link className="code-link" href={`/admin/products/${material.id}`}>{material.name}</Link><small style={{ display: "block" }} className="muted">{material.specification ?? "Chưa có quy cách"}</small></td><td>{one(material.material_groups)?.name}</td><td>{one(material.units_of_measure)?.symbol}</td><td>{[material.sale_enabled && "Bán", material.purchase_enabled && "Mua"].filter(Boolean).join(" · ")}</td><td><StatusBadge tone={material.active ? "success" : "danger"}>{material.active ? "Đang dùng" : "Ngừng dùng"}</StatusBadge></td></tr>)}</tbody></table></div></section></>;
}
