/** Permissions that only the owner holds and that no custom role may carry (owner decision D12). */
export const OWNER_ONLY_PERMISSIONS = ["roles.manage"] as const;

const GROUPS = [
  { id: "sales", label: "Bán hàng", prefixes: ["orders.", "customers.", "quotation.", "pricing.", "service."] },
  { id: "purchasing", label: "Mua hàng", prefixes: ["purchasing.", "suppliers."] },
  { id: "inventory", label: "Kho hàng", prefixes: ["inventory.", "catalog."] },
  { id: "delivery", label: "Giao hàng", prefixes: ["delivery."] },
  { id: "finance", label: "Tài chính", prefixes: ["finance."] },
  { id: "workforce", label: "Nhân công", prefixes: ["work.", "workforce.", "compensation."] },
] as const;

/** Permissions grouped the way the menu is, for the role editor; anything unmatched goes under "Khác". */
export function groupPermissions<T extends { code: string }>(permissions: T[]) {
  const groups = GROUPS.map((group) => ({ id: group.id, label: group.label, items: permissions.filter((item) => group.prefixes.some((prefix) => item.code.startsWith(prefix))) }));
  const grouped = new Set(groups.flatMap((group) => group.items.map((item) => item.code)));
  const rest = permissions.filter((item) => !grouped.has(item.code));
  return [...groups, { id: "other", label: "Khác", items: rest }].filter((group) => group.items.length > 0);
}
