export const SNAPSHOT_PAGE_SIZE = 50;

export interface SnapshotView {
  tab: string;
  after?: string;
}

export interface SnapshotPage {
  after?: string;
  next?: string;
}

export function parseSnapshotView(
  params: Record<string, string | string[] | undefined>,
  tabs: readonly string[],
): SnapshotView {
  if (!tabs[0]) throw new Error("At least one workspace tab is required.");
  const tab = typeof params.tab === "string" && tabs.includes(params.tab) ? params.tab : tabs[0];
  const after = typeof params.after === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.after)
    ? params.after.toLowerCase() : undefined;
  return { tab, after };
}

export function snapshotPage<T extends { id: string }>(rows: T[], view?: SnapshotView): { rows: T[]; page?: SnapshotPage } {
  if (!view) return { rows };
  const visible = rows.slice(0, SNAPSHOT_PAGE_SIZE);
  return { rows: visible, page: { after: view.after, next: rows.length > SNAPSHOT_PAGE_SIZE ? visible.at(-1)?.id : undefined } };
}
