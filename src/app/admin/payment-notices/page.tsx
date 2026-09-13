import { randomUUID } from "node:crypto";

import styles from "@/components/portal/portal.module.css";
import { getAdminPaymentNotices, reviewPaymentNoticeAction } from "@/modules/portal/actions";

const money = (value: string | number) => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(Number(value));

export default async function AdminPaymentNoticesPage() {
  const notices = await getAdminPaymentNotices();
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div>
          <h1>Thông báo thanh toán</h1>
          <p>Đối soát chứng từ; thao tác này không tạo phiếu thu và không phân bổ công nợ.</p>
        </div>
      </header>
      <div className={styles.grid}>
        {notices.length ? notices.map((notice) => {
          const stateId = "state-" + notice.id;
          const noteId = "note-" + notice.id;
          return (
            <article className={styles.card} key={notice.id}>
              <span className={styles.badge}>{notice.state}</span>
              <h2>{notice.customer_name}</h2>
              <p className={styles.amount}>{money(notice.amount_vnd)}</p>
              <div className={styles.meta}>
                <span>Ngày chuyển {notice.paid_on}</span>
                <span>{notice.reference ?? "Không có mã giao dịch"}</span>
              </div>
              <a className={styles.link} href={"/api/evidence/" + notice.evidence_id + "/signed"} rel="noreferrer" target="_blank">Mở chứng từ</a>
              <form action={reviewPaymentNoticeAction} className={styles.form}>
                <input name="notice_id" type="hidden" value={notice.id} />
                <input name="version" type="hidden" value={notice.version} />
                <input name="operation_id" type="hidden" value={randomUUID()} />
                <div className={styles.field}>
                  <label htmlFor={stateId}>Kết quả đối soát</label>
                  <select defaultValue="UNDER_REVIEW" id={stateId} name="state">
                    <option value="UNDER_REVIEW">Đang đối soát</option>
                    <option value="ACCEPTED">Chứng từ hợp lệ</option>
                    <option value="REJECTED">Từ chối</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor={noteId}>Ghi chú</label>
                  <textarea id={noteId} maxLength={500} minLength={3} name="review_note" />
                </div>
                <button className={styles.button} type="submit">Lưu kết quả đối soát</button>
              </form>
            </article>
          );
        }) : <p className={styles.empty}>Không có thông báo cần đối soát.</p>}
      </div>
    </div>
  );
}
