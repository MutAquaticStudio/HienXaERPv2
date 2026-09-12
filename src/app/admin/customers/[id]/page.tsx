import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

type CustomerProfile = { id: string; code: string; display_name: string; customer_type: string; phone: string | null; email: string | null; address_text: string | null; tax_code: string | null; tier_code: string | null; payment_terms_days: number; credit_limit_vnd?: string | number | null; internal_note?: string | null; active: boolean };
type SiteRow = { id: string; code: string; name: string; address_text: string; receiver_name: string | null; receiver_phone: string | null; receiving_window: string | null; access_note: string | null; active: boolean };
type PriceRow = { id: string; scope_type: string; unit_price_vnd: string; version: number; source_type: string; material_id: string | null; price_uom_id: string };
type ReceivableRow = { id: string; due_date: string; original_amount_vnd: string; outstanding_vnd: string };

export default async function CustomerDetailPage({ params }: PageProps<"/admin/customers/[id]">) {
  const access = await requireInternalPermission("customers.read");
  const { id } = await params;
  const canReadFinance = access.permissions.has("finance.ar.read");
  const canReadPricing = access.permissions.has("pricing.read");
  const canManageCustomer = access.permissions.has("customers.manage");
  const supabase = await createServerSupabase();
  const profileFields = `id, code, display_name, customer_type, phone, email, address_text, tax_code, tier_code, payment_terms_days, active${canReadFinance ? ", credit_limit_vnd" : ""}${canManageCustomer ? ", internal_note" : ""}`;
  const { data: profile, error } = await supabase.from("customers").select(profileFields).eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (error || !profile) notFound();
  const customer = profile as unknown as CustomerProfile;
  const [siteResult, priceResult, receivableResult, materialResult, uomResult] = await Promise.all([
    supabase.from("customer_sites").select("id, code, name, address_text, receiver_name, receiver_phone, receiving_window, access_note, active").eq("customer_id", id).order("name"),
    canReadPricing ? supabase.from("pricing_rule_read").select("id, scope_type, unit_price_vnd, version, source_type, material_id, price_uom_id").eq("customer_id", id).eq("active", true) : Promise.resolve({ data: [] }),
    canReadFinance ? supabase.from("receivable_obligation_read").select("id, due_date, original_amount_vnd, outstanding_vnd").eq("customer_id", id).order("due_date") : Promise.resolve({ data: [] }),
    canReadPricing ? supabase.from("materials").select("id, name") : Promise.resolve({ data: [] }),
    canReadPricing ? supabase.from("units_of_measure").select("id, symbol") : Promise.resolve({ data: [] }),
  ]);
  const sites = (siteResult.data ?? []) as unknown as SiteRow[];
  const prices = (priceResult.data ?? []) as unknown as PriceRow[];
  const receivables = (receivableResult.data ?? []) as unknown as ReceivableRow[];
  const materialNames = new Map((materialResult.data ?? []).map((material) => [material.id, material.name]));
  const uomSymbols = new Map((uomResult.data ?? []).map((uom) => [uom.id, uom.symbol]));
  const outstanding = receivables.reduce((total, row) => total + BigInt(row.outstanding_vnd), BigInt(0));

  return <><header className="page-heading"><div><p className="eyebrow">Khách hàng · {customer.code}</p><h1>{customer.display_name}</h1><p className="lede">{customer.phone ?? "Chưa có điện thoại"} · {customer.address_text ?? "Chưa có địa chỉ chính"}</p></div><StatusBadge tone={customer.active ? "success" : "danger"}>{customer.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></header><section className="metric-grid"><article className="card metric-card"><span className="metric-label">Công trình</span><strong className="metric-value">{sites.length}</strong></article><article className="card metric-card"><span className="metric-label">Chính sách giá riêng</span><strong className="metric-value">{canReadPricing ? prices.length : "—"}</strong></article><article className="card metric-card"><span className="metric-label">Phải thu</span><strong className="metric-value">{canReadFinance ? formatVnd(vnd(outstanding)) : "Không có quyền"}</strong></article><article className="card metric-card"><span className="metric-label">Hạn mức</span><strong className="metric-value">{canReadFinance ? customer.credit_limit_vnd == null ? "Chưa duyệt" : formatVnd(vnd(customer.credit_limit_vnd.toString())) : "Không có quyền"}</strong></article></section><div className="two-column"><section className="card card-pad"><h2>Hồ sơ & công trình</h2><dl className="detail-grid"><div className="detail-item"><dt>Loại khách</dt><dd>{customer.customer_type === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân"}</dd></div><div className="detail-item"><dt>Điều khoản</dt><dd>{customer.payment_terms_days} ngày</dd></div><div className="detail-item"><dt>Email</dt><dd>{customer.email ?? "Chưa có"}</dd></div><div className="detail-item"><dt>Mã số thuế</dt><dd>{customer.tax_code ?? "Chưa có"}</dd></div>{canManageCustomer && <div className="detail-item field-full"><dt>Ghi chú nội bộ</dt><dd>{customer.internal_note ?? "Chưa có"}</dd></div>}</dl><ul className="clean-list">{sites.map((site) => <li key={site.id}><strong>{site.name}</strong><small>{site.address_text} · Người nhận: {site.receiver_name ?? "Chưa chỉ định"} {site.receiver_phone ?? ""}</small><small>{site.receiving_window ?? "Không giới hạn giờ nhận"}{site.access_note ? ` · ${site.access_note}` : ""}</small></li>)}</ul></section><section className="card card-pad"><h2>Giá & giao dịch</h2>{canReadPricing ? <ul className="clean-list">{prices.map((price) => <li key={price.id}><strong>{price.material_id ? materialNames.get(price.material_id) ?? "Vật tư" : "Nhóm vật tư"}</strong><small>{formatVnd(vnd(price.unit_price_vnd))} / {uomSymbols.get(price.price_uom_id) ?? "đơn vị"} · phiên bản {price.version} · {price.source_type}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem chính sách giá.</p>}<h3>Chứng từ liên quan</h3><p className="muted">Báo giá/đơn bán mở ở R4; giao hàng ở R6; payment và invoice mở ở phase tương ứng. Trang này không tạo shadow ledger.</p></section></div></>;
}
