import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc } from "@/modules/portal/server";
import { PricingRuleEditor, type PriceOptions, type PriceRule } from "@/modules/pricing/editor";

const emptyOptions: PriceOptions = { customers: [], materials: [], groups: [], units: [] };

export default async function PricingSettingsPage() {
  const access = await requireInternalPermission("pricing.read");
  const canManage = access.permissions.has("pricing.manage");
  const supabase = await createServerSupabase();
  const [{ data, error }, options] = await Promise.all([
    supabase.from("pricing_rule_read").select("id,scope_type,customer_id,material_id,material_group_id,customer_tier_code,price_uom_id,unit_price_vnd,version,source_type,effective_from,effective_to,active").eq("branch_id", access.branchId).order("effective_from", { ascending: false }).order("id").limit(100),
    canManage ? portalRpc<PriceOptions>(supabase, "pricing_config_options", { target_branch_id: access.branchId }) : Promise.resolve(emptyOptions),
  ]);
  if (error) throw new Error("Không tải được chính sách giá.");
  const rules = (data ?? []) as PriceRule[];
  const label = (list: { id: string; name: string }[], id: string | null) => id ? list.find((option) => option.id === id)?.name ?? id : "";
  return <>
    <header className="page-heading"><div><p className="eyebrow">Cài đặt · {access.branchName}</p><h1>Chính sách giá</h1><p className="lede">Giá có hiệu lực theo phạm vi và ngày. Sửa giá bằng phiên bản mới, không viết lại chứng từ cũ.</p></div></header>
    {canManage && <details className="card card-pad"><summary>Tạo chính sách giá</summary><PricingRuleEditor options={options} /></details>}
    <p className="muted">Hiển thị tối đa 100 phiên bản mới nhất theo ngày hiệu lực.</p>
    {rules.map((rule) => <details className="card card-pad" key={rule.id}><summary>{rule.scope_type === "CUSTOMER_MATERIAL" || rule.scope_type === "CUSTOMER_GROUP" ? label(options.customers, rule.customer_id) : rule.scope_type === "CUSTOMER_TIER" ? `Nhóm ${rule.customer_tier_code}` : "Giá mặc định"} · {rule.material_id ? label(options.materials, rule.material_id) : label(options.groups, rule.material_group_id)} · {formatVnd(vnd(rule.unit_price_vnd))} · v{rule.version} · {rule.active ? "Đang dùng" : "Đã ngừng"}</summary><p className="muted">Đơn vị: {label(options.units, rule.price_uom_id)} · Nguồn: {rule.source_type} · Từ {new Date(rule.effective_from).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}{rule.effective_to ? ` đến trước ${new Date(rule.effective_to).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : ""}</p>{canManage && rule.active && <PricingRuleEditor rule={rule} options={options} />}</details>)}
  </>;
}
