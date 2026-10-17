import Link from "next/link";

export type DetailTab = { id: string; label: string; count?: number };

/**
 * Tabs of a record page (KiotViet-style "360" view). Each tab is a real address (`?tab=`), so only the open tab's data
 * is loaded, the browser back button works and a tab can be shared as a link.
 */
export function DetailTabs({ tabs, active, href, label }: { tabs: DetailTab[]; active: string; href: (tab: string) => string; label: string }) {
  return <nav className="detail-tabs" aria-label={label}>
    {tabs.map((tab) => <Link key={tab.id} href={href(tab.id)} aria-current={tab.id === active ? "page" : undefined} scroll={false}>
      {tab.label}{tab.count !== undefined && <span className="detail-tab-count">{tab.count}</span>}
    </Link>)}
  </nav>;
}

/** Picks the requested tab when it is one of `tabs`, else the first. */
export function activeTab(tabs: DetailTab[], requested: string | undefined) {
  return tabs.some((tab) => tab.id === requested) ? requested! : tabs[0].id;
}
