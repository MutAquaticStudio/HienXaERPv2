import { formatBusinessDate } from "@/lib/core/business-time";
import { priceSourceLabel, pricingScopeLabel } from "@/modules/pricing/presentation";
import { readPricingClock } from "@/modules/pricing/request-clock";
import { effectivePriceState, effectivePriceLabels, matchesEffectivePriceState } from "@/modules/pricing/effective-state";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc } from "@/modules/portal/server";
import { PricingRuleEditor, type PriceOptions, type PriceRule } from "@/modules/pricing/editor";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";

const emptyOptions: PriceOptions = { customers: [], materials: [], groups: [], units: [] };

export default async function PricingSettingsPage({ searchParams }: { searchParams: Promise<{state?: string}> }) {
  const query = await searchParams ?? {};
  const now = await readPricingClock(), instant = new Date(now).toISOString();
  const access = await requireInternalPermission("pricing.read");
  const canManage = access.permissions.has("pricing.manage");
  const supabase = await createServerSupabase();
  let request = supabase.from("pricing_rule_read").select("id,scope_type,customer_id,material_id,material_group_id,customer_tier_code,price_uom_id,unit_price_vnd::text,version,source_type,effective_from,effective_to,active").eq("branch_id", access.branchId).order("effective_from", { ascending: false }).order("id").limit(100);
  if (query.state === "ACTIVE") request = request.eq("active", true).lte("effective_from", instant).or("effective_to.is.null,effective_to.gt." + instant);
  if (query.state === "FUTURE") request = request.eq("active", true).gt("effective_from", instant);
  if (query.state === "EXPIRED") request = request.eq("active", true).lte("effective_to", instant);
  if (query.state === "INACTIVE") request = request.eq("active", false);
  const [{ data, error }, options] = await Promise.all([
    request,
    canManage ? portalRpc<PriceOptions>(supabase, "pricing_config_options", { target_branch_id: access.branchId }) : Promise.resolve(emptyOptions),
  ]);
  if (error) throw new Error("Không tải được chính sách giá.");
  const rules = ((data ?? []) as PriceRule[]).filter(rule => matchesEffectivePriceState(rule, query.state, now));
  const label = (list: { id: string; name: string }[], id: string | null) => id ? list.find((option) => option.id === id)?.name ?? id : "";
  return <>
    <header className="page-heading"><div><p className="eyebrow">Vật tư · {access.branchName}</p><h1 tabIndex={-1}>Chính sách giá</h1><p className="lede">Giá có hiệu lực theo phạm vi và ngày. Sửa giá bằng phiên bản mới, không viết lại chứng từ cũ.</p></div></header>
    <AutoFilterForm><label>Trạng thái<select name="state" defaultValue={query.state ?? ""}><option value="">Tất cả / lịch sử</option>{Object.entries(effectivePriceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></AutoFilterForm>
    {canManage && <details className="card card-pad"><summary>Tạo chính sách giá</summary><PricingRuleEditor options={options} /></details>}
    <p className="muted">Hiển thị tối đa 100 phiên bản mới nhất theo ngày hiệu lực.</p>
    {rules.map((rule) => <details className="card card-pad" key={rule.id} data-price-rule-id={rule.id}><summary>{rule.scope_type === "CUSTOMER_MATERIAL" || rule.scope_type === "CUSTOMER_GROUP" ? label(options.customers, rule.customer_id) : rule.scope_type === "CUSTOMER_TIER" ? `Nhóm ${rule.customer_tier_code}` : "Giá mặc định"} · {rule.material_id ? label(options.materials, rule.material_id) : label(options.groups, rule.material_group_id)} · {formatVnd(vnd(rule.unit_price_vnd))} · Phiên bản {rule.version} · {effectivePriceLabels[effectivePriceState(rule, now)]}</summary><p className="muted">Đơn vị: {label(options.units, rule.price_uom_id)} · Nguồn: {priceSourceLabel(rule.source_type)} · Từ {formatBusinessDate(rule.effective_from)}{rule.effective_to ? ` đến trước ${formatBusinessDate(rule.effective_to)}` : ""}</p>{canManage && rule.active && <PricingRuleEditor rule={rule} options={options} scopeLabel={[pricingScopeLabel(rule.scope_type), label(options.customers,rule.customer_id) || rule.customer_tier_code, rule.material_id ? label(options.materials,rule.material_id) : label(options.groups,rule.material_group_id), label(options.units,rule.price_uom_id)].filter(Boolean).join(" · ")} />}</details>)}
  </>;
}
