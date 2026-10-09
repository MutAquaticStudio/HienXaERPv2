import { catalogs } from "./fields";

export const catalogModules = {
  products: ["materials", "groups", "units", "conversions"],
  customers: ["customers", "sites"],
  suppliers: ["suppliers"],
  warehouses: ["warehouses"],
  dispatch: ["vehicles", "machines"],
  branches: ["branches"],
} as const;

const destinations: Record<string, string> = {
  materials: "/admin/products/manage", groups: "/admin/products/manage",
  units: "/admin/products/manage", conversions: "/admin/products/manage",
  customers: "/admin/customers/manage", sites: "/admin/customers/manage",
  suppliers: "/admin/suppliers/manage", warehouses: "/admin/inventory/warehouses",
  vehicles: "/admin/dispatch/resources", machines: "/admin/dispatch/resources",
  branches: "/admin/settings/branches",
};

export type CatalogQuery = { kind?: string; q?: string; id?: string; customerId?: string };

export function catalogHref(kind: string | undefined, query: Omit<CatalogQuery, "kind"> = {}): string {
  if (!kind || !Object.hasOwn(destinations, kind)) return "/admin/settings";
  const params = new URLSearchParams({ kind });
  for (const key of ["q", "id", "customerId"] as const) {
    if (query[key]) params.set(key, query[key]);
  }
  return `${destinations[kind]}?${params}`;
}

export function manageableCatalogs(kinds: readonly string[], permissions: ReadonlySet<string>) {
  return Object.entries(catalogs).filter(([kind, config]) => kinds.includes(kind) && permissions.has(config.permission));
}
