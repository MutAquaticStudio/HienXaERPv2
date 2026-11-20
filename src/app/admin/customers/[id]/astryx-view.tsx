import Link from "next/link";
import type { ReactNode } from "react";
import { AxButtonLink, AxPageHead, AxStatus, toneOf } from "@/components/astryx/ax-kit";
import { AxBanner, AxFacts, AxMeter, AxPanel, AxStrip, AxSum, AxTabs, AxTag } from "@/components/astryx/sales-kit";

export type AxCustomerHeader = {
  id: string; code: string; name: string; active: boolean; selfRegistered: boolean; phone: string | null; address: string | null; priceGroup: string;
  samePhone: { id: string; code: string; name: string }[];
  /** Số liệu đã định dạng; null = người xem không có quyền (hiện "—"). */
  metrics: { debt: string | null; overdue: string | null; overdueAlert: boolean; totalSales: string | null; openOrders: number | null; available: string | null; limit: string | null };
  tabs: { id: string; label: string; count?: number | string }[]; tab: string;
  /** Nút chức năng đã dựng ở trang (Sửa khách, + Công trình là hộp thoại danh mục). */
  actions: { createOrder: boolean; collect: boolean; service: boolean; quote: boolean };
  extraActions: ReactNode;
};

/** Khách hàng 360 kiểu Astryx: đầu trang, cảnh báo trùng số điện thoại, 5 chỉ số, thẻ tab (địa chỉ ?tab=) rồi nội dung tab. */
export function AstryxCustomerView({ header, children }: { header: AxCustomerHeader; children: ReactNode }) {
  const { metrics } = header;
  return <>
    <AxPageHead crumbs={["Bán hàng", "Khách hàng", header.code]} title={header.name}
      actions={<>
        {header.actions.collect && <AxButtonLink href={`/admin/receivables?customer=${header.id}`}>Ghi thu</AxButtonLink>}
        {header.actions.service && <AxButtonLink href={`/admin/service-jobs?customerId=${header.id}`}>Tạo dịch vụ</AxButtonLink>}
        {header.actions.quote && <AxButtonLink href={`/admin/quotations/new?customer=${header.id}`}>Tạo báo giá</AxButtonLink>}
        {header.extraActions}
        {header.actions.createOrder && <AxButtonLink href={`/admin/orders/new?customer=${header.id}`} kind="commerce">Tạo đơn</AxButtonLink>}
      </>} />
    <div style={{ marginTop: -12, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <AxStatus tone={toneOf(header.active ? "success" : "danger")}>{header.active ? "Đang giao dịch" : "Ngừng giao dịch"}</AxStatus>
      {header.selfRegistered && <AxTag tone="i">Tự đăng ký</AxTag>}
      <AxTag tone="i">{header.priceGroup}</AxTag>
      <span className="hx-muted">{header.phone ?? "Chưa có điện thoại"} · {header.address ?? "Chưa có địa chỉ chính"}</span>
    </div>
    {header.samePhone.length > 0 && <AxBanner status="warning" title="Có thể trùng khách: cùng số điện thoại"
      description={<>{header.samePhone.map((row, index) => <span key={row.id}>{index ? ", " : ""}<Link className="hx-code" href={`/admin/customers/${row.id}`}>{row.code} · {row.name}</Link></span>)}. Kiểm tra trước khi giao dịch; hệ thống không tự gộp.</>} />}
    <div style={{ marginBottom: 16 }}><AxStrip items={[
      { label: "Nợ hiện tại", value: metrics.debt ?? "—", num: true },
      { label: "Nợ quá hạn", value: <span className={metrics.overdueAlert ? "hx-neg" : undefined}>{metrics.overdue ?? "—"}</span>, num: true },
      { label: "Tổng bán (đơn đã xác nhận)", value: metrics.totalSales ?? "—", num: true },
      { label: "Đơn đang giao dở", value: metrics.openOrders ?? "—", num: true },
      { label: "Hạn mức còn lại", value: metrics.available ?? "—", sub: metrics.limit ? `Hạn mức ${metrics.limit}` : undefined, num: true },
    ]} /></div>
    <AxTabs tabs={header.tabs} active={header.tab} href={(next) => `/admin/customers/${header.id}?tab=${next}`} label="Nội dung khách hàng" />
    <div className="sx-legacy">{children}</div>
  </>;
}

export type AxSiteRow = { id: string; name: string; address: string; receiverName: string | null; receiverPhone: string | null; accessNote: string | null; active: boolean; edit: ReactNode };
export type AxCustomerInfoProps = {
  customerId: string; sites: AxSiteRow[]; canCreateOrder: boolean; canService: boolean;
  profile: { type: string; terms: string; email: string; taxCode: string; note?: string | null };
  credit: { debt: string; overdue: string; limit: string | null; available: string | null; percent: number | null } | null;
  priceGroup: string; accounts: ReactNode; linkRequests: ReactNode;
};

/** Tab "Thông tin & công trình": công trình (nhiều địa chỉ giao), tài khoản cổng khách ở bên trái; hồ sơ, hạn mức và chính sách bán ở bên phải. */
export function AstryxCustomerInfo(props: AxCustomerInfoProps) {
  return <div className="sx-cols">
    <div className="sx-stack">
      <AxPanel id="cust-sites" title="Công trình" sub={`${props.sites.length} địa chỉ giao hàng`} flush>
        {props.sites.length ? <div className="sx-table-wrap"><table className="sx-table stack">
          <thead><tr><th scope="col">Công trình</th><th scope="col">Người nhận</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
          <tbody>{props.sites.map((site) => <tr key={site.id} className={site.active ? undefined : "muted"}>
            <td data-label="Công trình"><b>{site.name}</b><small>{site.address}</small>{site.accessNote && <small>{site.accessNote}</small>}{!site.active && <small>Đã ngừng</small>}</td>
            <td data-label="Người nhận">{site.receiverName ?? "Chưa chỉ định"}{site.receiverPhone && <small>{site.receiverPhone}</small>}</td>
            <td data-label="Thao tác"><div className="sx-btnrow">
              {site.active && props.canCreateOrder && <Link className="hx-btn sm" href={`/admin/orders/new?customer=${props.customerId}&site=${site.id}`}>Tạo đơn</Link>}
              {site.active && props.canService && <Link className="hx-btn sm" href={`/admin/service-jobs?customerId=${props.customerId}&siteId=${site.id}`}>Tạo dịch vụ</Link>}
              {site.edit}</div></td>
          </tr>)}</tbody></table></div>
          : <p className="sx-pb hx-muted" style={{ margin: 0 }}>Chưa có công trình. Bấm “+ Công trình” để thêm.</p>}
      </AxPanel>
      {props.linkRequests}
      {props.accounts}
    </div>
    <div className="sx-stack">
      {props.credit && <AxPanel title="Hạn mức và công nợ">
        <AxSum label="Còn nợ" value={props.credit.debt} big />
        {props.credit.percent !== null && <div style={{ margin: "8px 0" }}><AxMeter percent={props.credit.percent} label="Đã dùng hạn mức" /><p className="sx-note" style={{ marginTop: 6 }}>Đã dùng {Math.round(props.credit.percent)}% hạn mức</p></div>}
        <AxSum label="Hạn mức nợ" value={props.credit.limit ?? "Chưa duyệt"} />
        <AxSum label="Quá hạn" value={props.credit.overdue} />
        <AxSum label="Còn được nợ thêm" value={props.credit.available ?? "Chưa duyệt"} />
      </AxPanel>}
      <AxPanel title="Hồ sơ"><AxFacts items={[{ label: "Loại khách", value: props.profile.type }, { label: "Điều khoản thanh toán", value: props.profile.terms }, { label: "Thư điện tử", value: props.profile.email }, { label: "Mã số thuế", value: props.profile.taxCode },
        props.profile.note !== undefined && { label: "Ghi chú nội bộ", value: props.profile.note ?? "Chưa có", full: true }]} /></AxPanel>
      <AxPanel title="Chính sách bán"><AxFacts items={[{ label: "Nhóm giá", value: props.priceGroup, sub: "Ưu tiên: giá riêng của khách, giá nhóm, rồi giá chung", full: true }]} /></AxPanel>
    </div>
  </div>;
}

export type AxCustomerOrderRow = { id: string; number: string; site: string; stateLabel: string; stateTone: "success" | "warning" | "info" | "danger"; deliveryLabel: string; paymentLabel: string; total: string; createdAt: string };
export function AstryxCustomerOrders({ rows }: { rows: AxCustomerOrderRow[] }) {
  return <AxPanel title="Đơn bán" sub="50 đơn gần nhất" flush>
    {rows.length ? <div className="sx-table-wrap"><table className="sx-table stack">
      <thead><tr><th scope="col">Mã đơn</th><th scope="col">Công trình</th><th scope="col">Trạng thái</th><th scope="col">Giao hàng</th><th scope="col">Thanh toán</th><th scope="col" className="num">Tổng tiền</th><th scope="col">Ngày tạo</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td data-label="Mã đơn"><Link className="hx-code" href={`/admin/orders/${row.id}`}>{row.number}</Link></td>
        <td data-label="Công trình">{row.site}</td>
        <td data-label="Trạng thái"><AxStatus tone={toneOf(row.stateTone)}>{row.stateLabel}</AxStatus></td>
        <td data-label="Giao hàng">{row.deliveryLabel}</td><td data-label="Thanh toán">{row.paymentLabel}</td>
        <td data-label="Tổng tiền" className="num">{row.total}</td><td data-label="Ngày tạo">{row.createdAt}</td>
      </tr>)}</tbody></table></div>
      : <p className="sx-pb hx-muted" style={{ margin: 0 }}>Chưa có đơn bán.</p>}
  </AxPanel>;
}
