type Quality = "READY" | "INCOMPLETE" | "NOT_APPLICABLE" | "FORBIDDEN" | "UNAVAILABLE";

type Metric = {
  value_vnd?: string | number | null;
  quality: Quality;
};

export type DashboardDetail = {
  expense_breakdown: {
    quality: Quality;
    items: Array<{
      source_kind: "EXPENSE" | "EARNING";
      label: string;
      amount_vnd: number;
    }>;
  };
  commission_detail: {
    quality: Quality;
    items: Array<{
      employee_id: string;
      employee_name: string;
      event_count: number;
      outstanding_amount_vnd: number;
    }>;
  };
};

function money(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function qualityMessage(quality: Quality) {
  if (quality === "FORBIDDEN") return "Bạn không có quyền xem chi tiết này.";
  if (quality === "NOT_APPLICABLE") return "Bộ lọc hiện tại không áp dụng cho chỉ số này.";
  if (quality === "INCOMPLETE") return "Dữ liệu chưa đủ để hiển thị chi tiết đáng tin cậy.";
  return "Chi tiết hiện chưa sẵn sàng.";
}

export function DashboardDetails({
  detail,
  expenseMetric,
  commissionMetric,
}: {
  detail: DashboardDetail | null;
  expenseMetric: Metric;
  commissionMetric: Metric;
}) {
  const expenseReady =
    expenseMetric.quality === "READY" && detail?.expense_breakdown.quality === "READY";
  const commissionReady =
    commissionMetric.quality === "READY" && detail?.commission_detail.quality === "READY";

  return (
    <div className="two-column dashboard-details">
      <section className="card card-pad stack">
        <div>
          <p className="eyebrow">Chi phí vận hành</p>
          <h2>Phân bổ theo nhóm</h2>
        </div>
        {expenseReady ? (
          detail.expense_breakdown.items.length > 0 ? (
            <ul className="rank-list">
              {detail.expense_breakdown.items.map((item) => (
                <li key={`${item.source_kind}:${item.label}`}>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.source_kind === "EXPENSE" ? "Chi phí" : "Thu nhập nhân sự"}</small>
                  </span>
                  <b>{money(item.amount_vnd)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Không có chi phí trong kỳ đã chọn.</p>
          )
        ) : (
          <p className="quality-callout">
            {qualityMessage(detail?.expense_breakdown.quality ?? expenseMetric.quality)}
          </p>
        )}
      </section>

      <section className="card card-pad stack">
        <div>
          <p className="eyebrow">Hoa hồng phải trả</p>
          <h2>Chi tiết theo nhân viên</h2>
        </div>
        {commissionReady ? (
          detail.commission_detail.items.length > 0 ? (
            <ul className="rank-list">
              {detail.commission_detail.items.map((item) => (
                <li key={item.employee_id}>
                  <span>
                    <strong>{item.employee_name}</strong>
                    <small>{item.event_count} khoản hoa hồng</small>
                  </span>
                  <b>{money(item.outstanding_amount_vnd)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Không có hoa hồng còn phải trả tại thời điểm đã chọn.</p>
          )
        ) : (
          <p className="quality-callout">
            {qualityMessage(detail?.commission_detail.quality ?? commissionMetric.quality)}
          </p>
        )}
      </section>
    </div>
  );
}
