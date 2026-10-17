import { formatBusinessDate } from "@/lib/core/business-time";
import { priceSourceLabel, pricingScopeLabel } from "@/modules/pricing/presentation";
import { readPricingClock } from "@/modules/pricing/request-clock";
import { effectivePriceState, effectivePriceLabels, effectivePriceTones, matchesEffectivePriceState } from "@/modules/pricing/effective-state";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc } from "@/modules/portal/server";
import type { PriceOptions, PriceRule } from "@/modules/pricing/editor";
import { PricingRuleList, type PriceRuleRow } from "@/modules/pricing/rule-list";
import { loadPriceGroups } from "@/modules/pricing/price-groups";
import { PriceGroupList } from "@/components/pricing/price-group-list";
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
  const [{ data, error }, loadedOptions, priceGroups, memberResult] = await Promise.all([
    request,
    canManage ? portalRpc<PriceOptions>(supabase, "pricing_config_options", { target_branch_id: access.branchId }) : Promise.resolve(emptyOptions),
    loadPriceGroups(supabase, access.branchId),
    supabase.from("customers").select("tier_code").eq("branch_id", access.branchId).not("tier_code", "is", null).limit(5000),
  ]);
  if (error || memberResult.error) throw new Error("Không tải được chính sách giá.");
  const options: PriceOptions = { ...loadedOptions, priceGroups: priceGroups.filter((group) => group.active).map((group) => ({ id: group.code, name: `${group.name} (${group.code})` })) };
  const members = new Map<string, number>();
  for (const row of (memberResult.data ?? []) as { tier_code: string }[]) members.set(row.tier_code, (members.get(row.tier_code) ?? 0) + 1);
  const groupName = (code: string | null) => priceGroups.find((group) => group.code === code)?.name ?? code;
  const rules = ((data ?? []) as PriceRule[]).filter(rule => matchesEffectivePriceState(rule, query.state, now));
  const label = (list: { id: string; name: string }[], id: string | null) => id ? list.find((option) => option.id === id)?.name ?? id : "";
  const rows: PriceRuleRow[] = rules.map((rule) => {
    const party = rule.scope_type === "CUSTOMER_MATERIAL" || rule.scope_type === "CUSTOMER_GROUP" ? label(options.customers, rule.customer_id)
      : rule.scope_type === "CUSTOMER_TIER" ? `Nhóm ${groupName(rule.customer_tier_code)}` : "Giá chung";
    const target = rule.material_id ? label(options.materials, rule.material_id) : label(options.groups, rule.material_group_id);
    const uom = label(options.units, rule.price_uom_id);
    const state = effectivePriceState(rule, now);
    return { id: rule.id, party, target, uom, price: formatVnd(vnd(rule.unit_price_vnd)), source: priceSourceLabel(rule.source_type),
      period: `Từ ${formatBusinessDate(rule.effective_from)}${rule.effective_to ? ` đến trước ${formatBusinessDate(rule.effective_to)}` : ""}`,
      version: rule.version, state: effectivePriceLabels[state], stateTone: effectivePriceTones[state], editable: canManage && rule.active, rule,
      scopeLabel: [pricingScopeLabel(rule.scope_type), label(options.customers, rule.customer_id) || groupName(rule.customer_tier_code), target, uom].filter(Boolean).join(" · ") };
  });
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Vật tư · {access.branchName}</p><h1 tabIndex={-1}>Chính sách giá</h1><p className="lede">Giá có hiệu lực theo phạm vi và ngày. Đổi giá tạo phiên bản mới, không viết lại chứng từ cũ.</p></div></header>
    <AutoFilterForm><label>Trạng thái<select name="state" defaultValue={query.state ?? ""}><option value="">Tất cả / lịch sử</option>{Object.entries(effectivePriceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></AutoFilterForm>
    <PriceGroupList canManage={canManage} groups={priceGroups.map((group) => ({ ...group, customers: members.get(group.code) ?? 0 }))} />
    <PricingRuleList rows={rows} options={options} canManage={canManage} partyLabel="Áp dụng cho" createLabel="+ Tạo chính sách giá" />
    <p className="muted">Hiển thị tối đa 100 phiên bản mới nhất theo ngày hiệu lực.</p>
  </div>;
}
