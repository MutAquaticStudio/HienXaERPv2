import Link from "next/link";
import { loadAuditPage, type AuditEvent, type AuditFilters } from "@/modules/audit/server";

type SearchValue = string | string[] | undefined;

const entityLabels: Record<string, string> = {
  customers: "khách hàng",
  customer_sites: "công trình",
  materials: "vật tư",
  material_groups: "nhóm vật tư",
  units_of_measure: "đơn vị tính",
  material_uom_conversions: "quy đổi đơn vị",
  warehouses: "kho",
  suppliers: "nhà cung cấp",
  pricing_rules: "chính sách giá",
  purchase_price_rules: "chính sách giá mua",
  vehicles: "xe",
  machines: "máy móc",
  branches: "chi nhánh",
  customer: "khách hàng",
  customer_site: "công trình",
  employee: "nhân sự",
  role: "vai trò",
  quotation: "báo giá",
  quotation_revision: "phiên bản báo giá",
  sales_order: "đơn bán",
  purchase_order: "đơn mua",
  delivery: "chuyến giao",
  payment: "phiếu thu/chi",
  payment_notice: "thông báo thanh toán",
  service_job: "công việc dịch vụ",
  work_item: "công việc thợ",
  pricing_rule: "quy tắc giá",
  inventory_count: "kiểm kê",
};

const actionLabels: Record<string, string> = {
  save: "lưu",
  create: "tạo",
  update: "cập nhật",
  deactivate: "ngừng sử dụng",
  created: "tạo",
  updated: "cập nhật",
  changed: "thay đổi",
  assigned: "gán",
  revoked: "thu hồi",
  reactivated: "kích hoạt lại",
  confirmed: "xác nhận",
  cancelled: "hủy",
  submitted: "gửi duyệt",
  send: "gửi",
  accept: "chấp nhận",
  accepted: "chấp nhận",
  under_review: "đưa vào xem xét",
  approved: "duyệt",
  rejected: "từ chối",
  posted: "ghi sổ",
  reversed: "đảo giao dịch",
  verified: "xác minh",
  published: "công bố",
};

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: SearchValue, length: number) {
  return first(value)?.trim().slice(0, length) || undefined;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function readableEntity(value: string) {
  return entityLabels[value] ?? value.replaceAll("_", " ");
}

function readableAction(value: string) {
  const suffix = value.split(".").at(-1) ?? value;
  return actionLabels[suffix] ?? suffix.replaceAll("_", " ");
}

function summary(event: AuditEvent) {
  return `${event.actorName} đã ${readableAction(event.action)} ${readableEntity(event.entityType)}`;
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
          <p className="eyebrow">Quản trị hệ thống</p>
          <h1>Nhật ký hoạt động</h1>
          <p className="muted">Theo dõi ai đã làm gì, trên đối tượng nào và vào thời điểm nào.</p>
        </div>
        <span className="scope-chip">{result.total.toLocaleString("vi-VN")} sự kiện</span>
      </section>

      <section className="card card-pad">
        <form className="filter-grid" method="get">
          <label className="field">
            <span>Người thực hiện</span>
            <input name="actor" defaultValue={filters.actor} placeholder="Tên hoặc UUID" />
          </label>
          <label className="field">
            <span>Đối tượng</span>
            <input name="entity" defaultValue={filters.entity} placeholder="Ví dụ: payment" />
          </label>
          <label className="field">
            <span>Hành động</span>
            <input name="action" defaultValue={filters.action} placeholder="Ví dụ: approved" />
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
                  <th>Lý do</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {result.events.map((event) => (
                  <tr key={event.id}>
                    <td><time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time></td>
                    <td>
                      <strong>{summary(event)}</strong>
                      <div className="muted">Mã đối tượng: <span className="mono">{event.entityId}</span></div>
                    </td>
                    <td>{event.reason || <span className="muted">Không ghi nhận lý do</span>}</td>
                    <td>
                      <details>
                        <summary>Xem dữ liệu kỹ thuật</summary>
                        <dl className="detail-grid">
                          <div className="detail-item"><dt>Action</dt><dd className="mono">{event.action}</dd></div>
                          <div className="detail-item"><dt>Entity</dt><dd className="mono">{event.entityType}</dd></div>
                          <div className="detail-item"><dt>Actor</dt><dd className="mono">{event.actorId}</dd></div>
                          <div className="detail-item"><dt>Trace</dt><dd className="mono">{event.traceId}</dd></div>
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
