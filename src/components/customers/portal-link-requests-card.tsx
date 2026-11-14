"use client";

import { useActionState, useState } from "react";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { decidePortalLinkRequestAction } from "@/modules/customers/portal-account-actions";
import { portalRoleLabel } from "./portal-accounts-card";

export type PortalLinkRequest = { id: string; display_name: string; phone: string; address_text: string; email: string | null; created_at: string };

/**
 * D78 · Khách hàng 360: someone registered on the customer portal with this customer's phone number. Nothing was linked by
 * itself (anyone can type a number); the office checks who it is and links the login, makes a new customer, or refuses.
 */
export function PortalLinkRequestsCard({ customerId, customerName, requests }: { customerId: string; customerName: string; requests: PortalLinkRequest[] }) {
  if (!requests.length) return null;
  return <section className="card card-pad portal-link-requests" aria-labelledby="portal-link-title">
    <div className="section-head"><h2 id="portal-link-title">Đăng ký cổng khách chờ duyệt ({requests.length})</h2></div>
    <p className="muted">Có người tự đăng ký cổng khách bằng số điện thoại của khách này. Hệ thống chưa gắn gì; gọi lại số đó để chắc là đúng người rồi chọn.</p>
    <ul className="portal-link-list">{requests.map((request) => <RequestRow key={request.id} customerId={customerId} customerName={customerName} request={request} />)}</ul>
  </section>;
}

function RequestRow({ customerId, customerName, request }: { customerId: string; customerName: string; request: PortalLinkRequest }) {
  const [state, action, pending] = useActionState(decidePortalLinkRequestAction, undefined);
  const [operationId] = useState(() => crypto.randomUUID());
  if (state?.success) return <li><p className="form-message" role="status">{state.message}</p></li>;
  return <li>
    <dl className="detail-grid">
      <div className="detail-item"><dt>Tên khách nhập</dt><dd>{request.display_name}</dd></div>
      <div className="detail-item"><dt>Số điện thoại</dt><dd>{request.phone}</dd></div>
      <div className="detail-item"><dt>Tài khoản</dt><dd>{request.email ?? "Không có email"}</dd></div>
      <div className="detail-item"><dt>Đăng ký lúc</dt><dd>{formatBusinessDateTime(request.created_at)}</dd></div>
      <div className="detail-item field-full"><dt>Địa chỉ khách nhập</dt><dd>{request.address_text}</dd></div>
    </dl>
    <form action={action} className="portal-link-form">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="operationId" value={operationId} />
      <div className="field"><label htmlFor={`link-role-${request.id}`}>Quyền khi gắn vào {customerName}</label>
        <select id={`link-role-${request.id}`} name="role" defaultValue="OWNER" disabled={pending}>
          {Object.entries(portalRoleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
      <div className="field"><label htmlFor={`link-note-${request.id}`}>Ghi chú (không bắt buộc)</label>
        <input id={`link-note-${request.id}`} name="note" maxLength={300} placeholder="Ví dụ: đã gọi xác nhận là con của chủ nhà" disabled={pending} /></div>
      {state?.message && <p className="form-message" role="alert">{state.message}</p>}
      <div className="form-actions">
        <button type="submit" name="decision" value="LINK" className="button button-primary" disabled={pending}>{pending ? "Đang lưu..." : `Gắn vào ${customerName}`}</button>
        <button type="submit" name="decision" value="NEW_CUSTOMER" className="button button-secondary" disabled={pending}>Tạo khách mới</button>
        <button type="submit" name="decision" value="REJECT" className="button button-secondary text-danger" disabled={pending}>Từ chối</button>
      </div>
    </form>
  </li>;
}
