import {
  Banknote,
  CheckCircle2,
  CircleDashed,
  Coins,
  FileCheck2,
} from "lucide-react";

import type {
  CompensationRuleType,
  MyEarningsSnapshot,
} from "@/modules/compensation/types";

const money = (value: string, currency: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
const date = (value: string) =>
  new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
const ruleLabels: Record<CompensationRuleType, string> = {
  FIXED_MONTHLY: "Cố định theo tháng",
  PER_JOB: "Theo công việc",
  PER_TRIP: "Theo chuyến",
  PER_HOUR: "Theo giờ",
  PER_SHIFT: "Theo ca",
  PER_DAY: "Theo ngày",
  PER_TON: "Theo tấn",
  PER_M3: "Theo m³",
  PER_BAG: "Theo bao",
  PER_UNIT: "Theo đơn vị",
  PERCENT_GROSS_PROFIT: "Theo % lợi nhuận gộp",
  BONUS: "Thưởng",
  ADJUSTMENT: "Điều chỉnh",
};

export function MyEarnings({ data }: { data: MyEarningsSnapshot }) {
  return (
    <section className="my-earnings" aria-labelledby="my-earnings-heading">
      <header>
        <p className="page-context">Chỉ dữ liệu của bạn</p>
        <h1 id="my-earnings-heading">Thu nhập của tôi</h1>
        <p>
          Đối chiếu công việc đã xác minh, số được duyệt và khoản chi đã liên
          kết.
        </p>
      </header>
      <div
        className="my-earning-metrics"
        aria-label="Tổng quan thu nhập cá nhân"
      >
        <article>
          <FileCheck2 aria-hidden="true" />
          <span>Việc đã xác minh</span>
          <strong>{data.verifiedJobs}</strong>
        </article>
        <article>
          <CheckCircle2 aria-hidden="true" />
          <span>Đã duyệt</span>
          <strong>{money(data.approvedAmount, data.currency)}</strong>
        </article>
        <article>
          <CircleDashed aria-hidden="true" />
          <span>Chờ duyệt</span>
          <strong>{money(data.pendingAmount, data.currency)}</strong>
        </article>
        <article>
          <Banknote aria-hidden="true" />
          <span>Đã liên kết chi</span>
          <strong>{money(data.paidAmount, data.currency)}</strong>
        </article>
      </div>
      <aside className="my-earning-note">
        <Coins aria-hidden="true" />
        <div>
          <strong>“Đã duyệt” chưa có nghĩa là “đã trả”</strong>
          <p>
            Khi Tài chính ghi nhận khoản chi và liên kết với dòng thu nhập, số
            tiền mới xuất hiện ở mục đã liên kết chi.
          </p>
        </div>
      </aside>
      <div className="my-earning-list">
        {data.earnings.map((earning) => (
          <article key={earning.allocationId}>
            <header>
              <div>
                <span>{earning.sourceNumber}</span>
                <h2>{earning.description}</h2>
              </div>
              <strong>
                {earning.status === "APPROVED"
                  ? "Đã duyệt"
                  : earning.status === "PENDING_APPROVAL"
                    ? "Chờ duyệt"
                    : "Đã đảo"}
              </strong>
            </header>
            <dl>
              <div>
                <dt>Ngày ghi nhận</dt>
                <dd>{date(earning.earnedOn)}</dd>
              </div>
              <div>
                <dt>Cách tính</dt>
                <dd>{ruleLabels[earning.ruleType]}</dd>
              </div>
              <div>
                <dt>Sản lượng</dt>
                <dd>{Number(earning.unitsSnapshot).toLocaleString("vi-VN")}</dd>
              </div>
              <div>
                <dt>Mức áp dụng</dt>
                <dd>{money(earning.rateSnapshot, earning.currency)}</dd>
              </div>
            </dl>
            <div className="my-earning-total">
              <span>Quyền lợi của bạn</span>
              <strong>{money(earning.netAmount, earning.currency)}</strong>
            </div>
            {Number(earning.adjustmentAmount) !== 0 ? (
              <p className="my-earning-adjustment">
                Đã điều chỉnh{" "}
                {money(earning.adjustmentAmount, earning.currency)}
              </p>
            ) : null}
            <p className="my-earning-paid">
              Đã liên kết chi:{" "}
              <strong>{money(earning.paidAmount, earning.currency)}</strong>
            </p>
          </article>
        ))}
      </div>
      {!data.earnings.length ? (
        <div className="empty-work-card">
          <Coins size={66} />
          <h2>Chưa có quyền lợi được ghi nhận</h2>
          <p>
            Quyền lợi sẽ xuất hiện sau khi công việc được giám sát xác minh và
            cách tính hợp lệ được áp dụng.
          </p>
        </div>
      ) : null}
    </section>
  );
}
