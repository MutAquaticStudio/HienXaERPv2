import { formatBusinessDateTime } from "@/lib/core/business-time";
import { portalOrderStateLabel } from "@/modules/portal/presentation";
import Link from "next/link";

import { OrderProgress } from "@/components/portal/order-progress";
import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalSnapshot } from "@/modules/portal/actions";
import { formatPortalMoney } from "@/modules/portal/money";
import { getCustomerServiceRequests } from "@/modules/portal/service-actions";
import {
  isDoneStage, isOpenStage, requestMeta, requestSubtitle, requestTitle, serviceStageLabel, serviceStageTone, type CustomerServiceRequest,
} from "@/modules/portal/service-request";

const FILTERS = [{ key: "open", label: "Đang xử lý" }, { key: "done", label: "Hoàn tất" }, { key: "all", label: "Tất cả" }] as const;
type Filter = (typeof FILTERS)[number]["key"];

function matches(request: CustomerServiceRequest, filter: Filter) {
  return filter === "all" || (filter === "open" ? isOpenStage(request.stage) : isDoneStage(request.stage));
}

/** "Đơn hàng" has two tabs (D75): goods orders as before, and the customer's service requests with an "Đang xử lý / Hoàn tất / Tất cả" filter. */
export default async function CustomerOrdersPage({ searchParams }: { searchParams: Promise<{ notice?: string; kind?: string; show?: string }> }) {
  const query = await searchParams;
  const services = query.kind === "services";
  const snapshot = await getCustomerPortalSnapshot();
  const canOrder = snapshot.membership_role === "OWNER";
  const requests = services ? await getCustomerServiceRequests() : null;
  const filter: Filter = FILTERS.some((item) => item.key === query.show) ? (query.show as Filter) : "open";
  const open = requests?.requests.filter((request) => isOpenStage(request.stage)).length ?? 0;
  const shown = requests?.requests.filter((request) => matches(request, filter)) ?? [];
  return (
    <div className={styles.page}>
      {query.notice === "order-unavailable" && <p className={styles.status} role="status">Đơn hàng không thuộc phạm vi truy cập của bạn. Hãy chọn đơn trong danh sách khách hàng hiện tại.</p>}
      {query.notice === "request-unavailable" && <p className={styles.status} role="status">Yêu cầu dịch vụ không thuộc phạm vi truy cập của bạn. Hãy chọn yêu cầu trong danh sách.</p>}
      <header className={styles.sectionHead}>
        <div><h1>Đơn hàng</h1><p>{services ? "Theo dõi các yêu cầu dịch vụ bạn đã gửi." : "Theo dõi tiến trình giao nhận và thông tin đơn hàng của bạn."}</p></div>
        {canOrder && <Link className={styles.button} href={services ? "/customer/services/new" : "/customer/orders/new"}>{services ? "Đặt dịch vụ" : "Đặt hàng"}</Link>}
      </header>
      <nav className={styles.kindSwitch} aria-label="Loại đơn">
        <Link href="/customer/orders" aria-current={services ? undefined : "page"}>Hàng hóa</Link>
        <Link href="/customer/orders?kind=services" aria-current={services ? "page" : undefined}>Dịch vụ</Link>
      </nav>

      {!services && <div className={styles.grid}>
        {snapshot.orders.length ? snapshot.orders.map((order) => (
          <article className={styles.card} key={order.id}>
            <span className={`${styles.badge} ${order.channel === "CUSTOMER_PORTAL" && order.state === "DRAFT" ? styles.badgeWarm : ""}`}>{portalOrderStateLabel(order)}</span>
            <h2>{order.number ?? "Đơn hàng"}</h2>
            <div className={styles.meta}>
              {order.site_name && <span>{order.site_name}</span>}
              <span>{order.deliveries.length} lượt giao</span>
              <span>{order.requested_delivery_date ? formatBusinessDateTime(order.requested_delivery_date) : "Chưa chốt ngày giao"}</span>
            </div>
            <OrderProgress order={order} compact />
            <Link className={styles.buttonSecondary} href={"/customer/orders/" + order.id}>Xem tiến trình</Link>
          </article>
        )) : <p className={styles.empty}>Chưa có đơn hàng.</p>}
      </div>}

      {services && <>
        <nav className={styles.filterChips} aria-label="Lọc theo trạng thái">
          {FILTERS.map((item) => <Link key={item.key} href={`/customer/orders?kind=services&show=${item.key}`} aria-current={filter === item.key ? "true" : undefined}>
            {item.label}{item.key === "open" && open > 0 ? ` · ${open}` : ""}</Link>)}
        </nav>
        {shown.length > 0 ? <ul className={styles.reqList}>{shown.map((request) => <li key={request.id}>
          <Link className={styles.reqCard} href={`/customer/services/${request.id}`}>
            <span className={styles.reqTop}>
              <span><strong>{requestTitle(request)}</strong><small>{requestSubtitle(request)}</small></span>
              <span className={styles.reqChip} data-tone={serviceStageTone(request.stage)}>{serviceStageLabel(request.stage)}</span>
            </span>
            <span className={styles.reqMeta}>{requestMeta(request, formatPortalMoney)}</span>
          </Link>
        </li>)}</ul> : <div className={styles.card}>
          <p className={styles.empty}>{requests && requests.requests.length === 0 ? "Chưa có yêu cầu dịch vụ nào." : filter === "open" ? "Không có yêu cầu nào đang xử lý." : "Không có yêu cầu nào trong mục này."}</p>
          {requests && requests.requests.length > 0 && filter !== "all" && <Link className={styles.headLink} href="/customer/orders?kind=services&show=all">Xem tất cả yêu cầu</Link>}
          {canOrder && requests?.requests.length === 0 && <Link className={styles.buttonSecondary} href="/customer/services/new">Đặt dịch vụ</Link>}
        </div>}
      </>}
    </div>
  );
}
