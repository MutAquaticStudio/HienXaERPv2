import Link from "next/link";
import type { SnapshotPage } from "@/modules/platform/snapshot-view";

export function SnapshotPagination({ pathname, tab, page }: { pathname: string; tab: string; page?: SnapshotPage }) {
  if (!page) return null;
  const first = `${pathname}?${new URLSearchParams({ tab })}`;
  const next = `${pathname}?${new URLSearchParams({ tab, after: page.next ?? "" })}`;
  return (
    <nav aria-label="Phân trang dữ liệu" className="customer-header-actions">
      <span>{pathname === "/app/data" ? "Tối đa 50 vật liệu mỗi trang" : pathname === "/app/sourcing" && tab === "allocations" ? "Tối đa 50 dòng đơn bán mỗi trang; hiển thị đủ phân bổ của từng dòng" : "Tối đa 50 bản ghi mỗi trang"}</span>
      {page.after ? <Link className="secondary-button button-link" href={first} prefetch={false}>Trang đầu</Link> : null}
      {page.next ? <Link className="secondary-button button-link" href={next} prefetch={false}>Trang tiếp</Link> : null}
    </nav>
  );
}
