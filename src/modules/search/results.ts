import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { deliveryStateLabel } from "@/modules/delivery/presentation";
import { purchaseStateLabel } from "@/modules/purchasing/presentation";
import { salesStateLabel } from "@/modules/sales/presentation";

/** D56: one line of the search box — where it opens, what it is, a detail and an optional state badge. */
export type SearchHit = { id: string; href: string; title: string; detail: string; badge?: string };
export type SearchGroup = { key: string; label: string; hits: SearchHit[] };
export type SearchResult = { groups: SearchGroup[]; exact: string | null };

type Raw = {
  customers?: { id: string; code: string; name: string; phone: string | null }[];
  sites?: { id: string; customer_id: string; name: string; customer_name: string; address_text: string | null }[];
  orders?: { id: string; number: string; customer: string; site: string; state: string; created_at: string }[];
  deliveries?: { id: string; number: string; customer: string; site: string; state: string; scheduled_at: string | null }[];
  purchases?: { id: string; number: string; supplier: string; destination: string | null; state: string; created_at: string }[];
  suppliers?: { id: string; code: string; name: string; phone: string | null }[];
  materials?: { id: string; code: string; name: string }[];
};

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** Groups in the order people look for them; a document number typed exactly opens that document directly. */
export function searchResult(raw: Raw, term: string): SearchResult {
  const groups: SearchGroup[] = [
    { key: "customers", label: "Khách hàng", hits: (raw.customers ?? []).map((row) => ({ id: row.id, href: `/admin/customers/${row.id}`, title: row.name, detail: join(row.code, row.phone) })) },
    { key: "sites", label: "Công trình", hits: (raw.sites ?? []).map((row) => ({ id: row.id, href: `/admin/customers/${row.customer_id}`, title: row.name, detail: join(`Của ${row.customer_name}`, row.address_text) })) },
    { key: "orders", label: "Đơn bán", hits: (raw.orders ?? []).map((row) => ({ id: row.id, href: `/admin/orders/${row.id}`, title: row.number, detail: join(row.customer, row.site, formatBusinessDate(row.created_at)), badge: salesStateLabel(row.state) })) },
    { key: "deliveries", label: "Phiếu giao", hits: (raw.deliveries ?? []).map((row) => ({ id: row.id, href: `/admin/deliveries/${row.id}`, title: row.number, detail: join(row.customer, row.site, row.scheduled_at ? `hẹn ${formatBusinessDateTime(row.scheduled_at)}` : null), badge: deliveryStateLabel(row.state) })) },
    { key: "purchases", label: "Đơn mua", hits: (raw.purchases ?? []).map((row) => ({ id: row.id, href: `/admin/purchase-orders/${row.id}`, title: row.number, detail: join(row.supplier, row.destination), badge: purchaseStateLabel(row.state) })) },
    { key: "suppliers", label: "Nhà cung cấp", hits: (raw.suppliers ?? []).map((row) => ({ id: row.id, href: `/admin/suppliers/${row.id}`, title: row.name, detail: join(row.code, row.phone) })) },
    { key: "materials", label: "Vật tư", hits: (raw.materials ?? []).map((row) => ({ id: row.id, href: `/admin/products/${row.id}`, title: row.name, detail: row.code })) },
  ].filter((group) => group.hits.length > 0);
  const wanted = term.trim().toUpperCase();
  const exact = groups.flatMap((group) => ["orders", "deliveries", "purchases"].includes(group.key) ? group.hits : [])
    .find((hit) => hit.title.toUpperCase() === wanted)?.href ?? null;
  return { groups, exact };
}
