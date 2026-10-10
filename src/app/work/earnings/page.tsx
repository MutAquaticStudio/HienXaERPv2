import { formatBusinessDate } from "@/lib/core/business-time";
import { earningStateLabel, earningKindLabel } from "@/modules/portal/presentation";
import styles from "@/components/portal/portal.module.css";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";

const money = (value?: string) => new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
}).format(Number(value ?? 0));

export default async function WorkEarningsPage() {
  const snapshot = await getWorkerPortalSnapshot();
  const total = snapshot.earnings.reduce((sum, item) => sum + Number(item.amount_vnd ?? 0), 0);
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.heroEyebrow}>Thu nhập đã ghi nhận</p>
        <h1>{money(String(total))}</h1>
        <p>Chỉ các khoản thu nhập của chính bạn; thanh toán thực tế được theo dõi riêng.</p>
      </header>
      <div className={styles.grid}>
        {snapshot.earnings.length ? snapshot.earnings.map((item) => (
          <article className={styles.card} key={item.id}>
            <span className={styles.badge}>{earningStateLabel(item.state)}</span>
            <h2>{earningKindLabel(item.type)}</h2>
            <p className={styles.amount}>{money(item.amount_vnd)}</p>
            <p className={styles.hint}>{item.occurred_at ? formatBusinessDate(item.occurred_at) : ""}</p>
          </article>
        )) : <p className={styles.empty}>Chưa có khoản thu nhập được ghi nhận.</p>}
      </div>
    </div>
  );
}
