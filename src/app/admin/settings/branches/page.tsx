import type { Metadata } from "next";
import ModuleCatalogPage from "@/modules/catalog/module-page";
import { catalogModules, type CatalogQuery } from "@/modules/catalog/ownership";

export const metadata: Metadata = { title: "Chi nhánh · Cài đặt" };
export default function ManagementPage(props: { searchParams: Promise<CatalogQuery> }) {
  return ModuleCatalogPage({ ...props, kinds: catalogModules.branches, parent: { href: "/admin/settings", label: "Cài đặt" } });
}
