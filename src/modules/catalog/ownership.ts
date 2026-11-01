import { catalogs } from "./fields";

/** Catalogs managed on a module's management page (tabs), by module. */
export const catalogModules = {
  products: ["groups", "units", "conversions"],
  customers: ["sites"],
  warehouses: ["warehouses"],
  dispatch: ["vehicles", "machines"],
  services: ["service_types"],
  branches: ["branches"],
} as const;

/**
 * Catalogs added and edited from their own list and detail pages (popup in place), not from a management page.
 * Old management links for them lead to the list, or to the record's detail page.
 */
export const listOwnedCatalogs: Readonly<Record<string, string>> = {
  materials: "/admin/products", customers: "/admin/customers", suppliers: "/admin/suppliers",
};

const destinations: Record<string, string> = {
  groups: "/admin/products/manage",
  units: "/admin/products/manage", conversions: "/admin/products/manage",
  sites: "/admin/customers/manage",
  warehouses: "/admin/inventory/warehouses",
  vehicles: "/admin/dispatch/resources", machines: "/admin/dispatch/resources",
  service_types: "/admin/service-jobs/types",
  branches: "/admin/settings/branches",
};

export type CatalogQuery = { kind?: string; q?: string; id?: string; customerId?: string; tab?: string };

export function catalogHref(kind: string | undefined, query: Omit<CatalogQuery, "kind"> = {}): string {
  if (kind && Object.hasOwn(listOwnedCatalogs, kind)) {
    const list = listOwnedCatalogs[kind];
    if (query.id) return `${list}/${encodeURIComponent(query.id)}`;
    return query.q ? `${list}?${new URLSearchParams({ q: query.q })}` : list;
  }
  if (!kind || !Object.hasOwn(destinations, kind)) return "/admin/settings";
  const params = new URLSearchParams({ kind });
  for (const key of ["q", "id", "customerId", "tab"] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  return `${destinations[kind]}?${params}`;
}

export function manageableCatalogs(kinds: readonly string[], permissions: ReadonlySet<string>) {
  return Object.entries(catalogs).filter(([kind, config]) => kinds.includes(kind) && permissions.has(config.permission));
}
