/** D29: while the next office screen loads, the frame stays and grey shapes stand in for the page. */
export default function AdminLoading() {
  return <div className="skeleton-page" role="status" aria-label="Đang tải dữ liệu">
    <div><span className="skeleton" style={{ width: 120, height: 12 }} /><span className="skeleton" style={{ width: 260, height: 26, marginTop: 10 }} /></div>
    <div className="metric-grid">
      {[0, 1, 2, 3].map((key) => <div className="card metric-card" key={key}><span className="skeleton" style={{ width: "50%", height: 12 }} /><span className="skeleton" style={{ width: "75%", height: 24, marginTop: 12 }} /></div>)}
    </div>
    <div className="card">
      <div className="section-head"><span className="skeleton" style={{ width: 180, height: 16 }} /></div>
      {[0, 1, 2, 3, 4, 5].map((key) => <div className="skeleton-row" key={key}>
        <span className="skeleton" style={{ height: 12 }} /><span className="skeleton" style={{ height: 12 }} /><span className="skeleton" style={{ height: 12 }} /><span className="skeleton" style={{ height: 12 }} />
      </div>)}
    </div>
  </div>;
}
