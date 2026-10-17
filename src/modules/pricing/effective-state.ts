export type EffectivePriceRule = { active: boolean; effective_from: string; effective_to: string | null };
export type EffectivePriceState = "ACTIVE" | "FUTURE" | "EXPIRED" | "INACTIVE";
export const effectivePriceLabels: Record<EffectivePriceState, string> = {
  ACTIVE: "Đang hiệu lực", FUTURE: "Chưa có hiệu lực", EXPIRED: "Hết hiệu lực", INACTIVE: "Đã ngừng",
};

export const effectivePriceTones: Record<EffectivePriceState, "success" | "info" | "warning" | "danger"> = {
  ACTIVE: "success", FUTURE: "info", EXPIRED: "warning", INACTIVE: "danger",
};

// now is captured once on the server; TIMESTAMPTZ values represent absolute instants.
export function effectivePriceState(rule: EffectivePriceRule, now: number): EffectivePriceState {
  if (!rule.active) return "INACTIVE";
  const start = Date.parse(rule.effective_from);
  const end = rule.effective_to === null ? null : Date.parse(rule.effective_to);
  if (!Number.isFinite(now) || !Number.isFinite(start) || (end !== null && !Number.isFinite(end))) {
    throw new Error("Thời gian hiệu lực giá không hợp lệ.");
  }
  if (now < start) return "FUTURE";
  if (end !== null && now >= end) return "EXPIRED";
  return "ACTIVE";
}

export function matchesEffectivePriceState(rule: EffectivePriceRule, filter: string | undefined, now: number): boolean {
  return !filter || !(filter in effectivePriceLabels) || effectivePriceState(rule, now) === filter;
}
