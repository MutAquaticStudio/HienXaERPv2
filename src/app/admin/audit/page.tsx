import { formatBusinessDateTime } from "@/lib/core/business-time";
import Link from "next/link";
import { loadAuditPage, type AuditFilters } from "@/modules/audit/server";
import { ACTION_FILTERS, auditSentence, ENTITY_FILTERS } from "@/modules/audit/presentation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nhật ký hoạt động" };

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: SearchValue, length: number) {
  return first(value)?.trim().slice(0, length) || undefined;
}

function formatTime(value: string) {
  return formatBusinessDateTime(value);
}

function pageHref(filters: AuditFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(page));
  return `/admin/audit?${params.toString()}`;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const params = await searchParams;
  const filters: AuditFilters = {
    actor: clean(params.actor, 80),
    entity: clean(params.entity, 80),
    action: clean(params.action, 100),
    from: clean(params.from, 10),
    to: clean(params.to, 10),
    page: Math.max(1, Number(first(params.page)) || 1),
  };
  const result = await loadAuditPage(filters);

  return (
    <div className="page-stack">
      <section className="section-head">
        <div>
          
          <h1>Nhật ký hoạt động</h1>
          <p className="muted">Theo dõi ai đã làm gì, trên đối tượng nào và vào thời điểm nào.</p>
        </div>
        <span className="scope-chip">{result.total.toLocaleString("vi-VN")} sự kiện</span>
      </section>

      <section className="card card-pad">
        <form className="filter-grid" method="get">
          <label className="field">
            <span>Người thực hiện</span>
            <input name="actor" defaultValue={filters.actor} placeholder="Tên nhân viên" />
          </label>
          <label className="field">
            <span>Loại đối tượng</span>
            <select name="entity" defaultValue={filters.entity ?? ""}><option value="">Tất cả</option>
              {ENTITY_FILTERS.map((noun) => <option key={noun} value={noun}>{noun.charAt(0).toUpperCase() + noun.slice(1)}</option>)}</select>
          </label>
          <label className="field">
            <span>Việc đã làm</span>
            <select name="action" defaultValue={filters.action ?? ""}><option value="">Tất cả</option>
              {ACTION_FILTERS.map(([code, label]) => <option key={code} value={code}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>)}</select>
          </label>
          <label className="field">
            <span>Từ ngày</span>
            <input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label className="field">
            <span>Đến ngày</span>
            <input type="date" name="to" defaultValue={filters.to} />
          </label>
          <div className="form-actions">
            <button className="button button-primary" type="submit">Lọc</button>
            <Link className="button button-secondary" href="/admin/audit">Xóa lọc</Link>
          </div>
        </form>
      </section>

      <section className="card">
        {result.events.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Sự kiện</th>
                  <th>Ghi chú</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {result.events.map((event) => (
                  <tr key={event.id}>
                    <td><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></td>
                    <td>
                      <strong>{auditSentence(event.actorName, event.action, event.entityType)}</strong>
                      {event.object && <div className="audit-object">{event.object.href
                        ? <Link className="code-link" href={event.object.href}>{event.object.label}</Link> : <span>{event.object.label}</span>}</div>}
                    </td>
                    <td>{event.reason || <span className="muted">Không có ghi chú</span>}</td>
                    <td>
                      <details>
                        <summary>Xem dữ liệu kỹ thuật</summary>
                        <dl className="detail-grid">
                          <div className="detail-item"><dt>Hành động</dt><dd className="mono">{event.action}</dd></div>
                          <div className="detail-item"><dt>Đối tượng</dt><dd className="mono">{event.entityType} · {event.entityId}</dd></div>
                          <div className="detail-item"><dt>Người thực hiện</dt><dd className="mono">{event.actorId}</dd></div>
                          <div className="detail-item"><dt>Mã truy vết</dt><dd className="mono">{event.traceId}</dd></div>
                          <div className="detail-item"><dt>Trường thay đổi</dt><dd className="mono">{event.changedFields.join(", ") || "—"}</dd></div>
                        </dl>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-inline">Không có sự kiện phù hợp bộ lọc.</div>
        )}
      </section>

      <nav className="list-pagination" aria-label="Phân trang nhật ký">
        {result.page > 1 ? <Link className="button button-secondary" href={pageHref(filters, result.page - 1)}>Trang trước</Link> : <span />}
        <span>Trang {result.page} / {result.pageCount}</span>
        {result.page < result.pageCount ? <Link className="button button-secondary" href={pageHref(filters, result.page + 1)}>Trang sau</Link> : <span />}
      </nav>
    </div>
  );
}
