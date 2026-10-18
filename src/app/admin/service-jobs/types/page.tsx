import ModuleCatalogPage from "@/modules/catalog/module-page";
import { catalogModules, type CatalogQuery } from "@/modules/catalog/ownership";
export default function ServiceTypesPage(props: { searchParams: Promise<CatalogQuery> }) {
  return ModuleCatalogPage({ ...props, kinds: catalogModules.services });
}
