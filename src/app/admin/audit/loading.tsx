export default function AuditLoading() {
  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <section className="section-head">
        <div>
          <p className="eyebrow">Quản trị hệ thống</p>
          <h1>Nhật ký hoạt động</h1>
          <p className="muted">Đang tải các sự kiện đã được phân quyền...</p>
        </div>
      </section>
      <section className="card card-pad"><div className="skeleton-block" /></section>
      <section className="card card-pad"><div className="skeleton-block" /></section>
    </div>
  );
}
