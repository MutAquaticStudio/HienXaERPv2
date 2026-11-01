import { redirect } from "next/navigation";
import { catalogHref, type CatalogQuery } from "@/modules/catalog/ownership";

/** Suppliers are added and edited on the supplier list and detail pages; old management links lead there. */
export default async function ManagementPage({ searchParams }: { searchParams: Promise<CatalogQuery> }) {
  const params = await searchParams;
  redirect(catalogHref("suppliers", { id: params.id, q: params.q }));
}
