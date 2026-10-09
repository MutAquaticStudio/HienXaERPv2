import { redirect } from "next/navigation";
import { requireInternalAccess } from "@/lib/access/context";
import { catalogs } from "@/modules/catalog/fields";
import { catalogHref, manageableCatalogs, type CatalogQuery } from "@/modules/catalog/ownership";
export default async function CatalogPage({ searchParams }: { searchParams: Promise<CatalogQuery> }) {
  const access = await requireInternalAccess();
  const params = await searchParams;
  const available = manageableCatalogs(Object.keys(catalogs), access.permissions);
  const kind = available.some(([key]) => key === params.kind) ? params.kind : available[0]?.[0];
  if (!kind) return <p>Không có quyền quản lý danh mục.</p>;
  redirect(catalogHref(kind, { q: params.q, id: params.id, customerId: params.customerId }));
}
