// D75: "Đặt lại nhanh" on the customer home page offers goods and services together.
export type QuickReorder = { key: string; kind: "goods" | "service"; at: string; title: string; site?: string | null; href: string };

const time = (value: string) => { const parsed = new Date(value).getTime(); return Number.isNaN(parsed) ? 0 : parsed; };

/**
 * At most `limit` cards: the newest goods order and the newest service request when both exist (so neither kind is crowded
 * out), otherwise the newest of the one kind that exists; newest first.
 */
export function quickReorders(goods: QuickReorder[], services: QuickReorder[], limit = 2): QuickReorder[] {
  const byNewest = (items: QuickReorder[]) => [...items].sort((left, right) => time(right.at) - time(left.at));
  const [newestGoods, ...moreGoods] = byNewest(goods);
  const [newestService, ...moreServices] = byNewest(services);
  const picked = [newestGoods, newestService].filter((item): item is QuickReorder => Boolean(item));
  const rest = byNewest([...moreGoods, ...moreServices]);
  while (picked.length < limit && rest.length) picked.push(rest.shift()!);
  return byNewest(picked).slice(0, limit);
}
