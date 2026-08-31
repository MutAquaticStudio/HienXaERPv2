"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  Building2,
  Calculator,
  CircleDollarSign,
  ContactRound,
  CreditCard,
  History,
  MapPin,
  PackageCheck,
  Plus,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import {
  saveCustomer360Action,
  type Customer360ActionState,
} from "@/app/app/sales/actions";
import { evaluateCustomerCredit } from "@/modules/customer-360/credit";
import { resolveCustomerPrice } from "@/modules/customer-360/pricing";
import type {
  Customer360EntityKind,
  Customer360Snapshot,
  PriceRuleScope,
} from "@/modules/customer-360/types";

type WorkspaceTab = "profile" | "pricing" | "credit";

const TIER_LABELS = {
  STANDARD: "Tiêu chuẩn",
  SILVER: "Bạc",
  GOLD: "Vàng",
  STRATEGIC: "Chiến lược",
} as const;

const SCOPE_LABELS = {
  CUSTOMER_MATERIAL: "Khách hàng + vật liệu",
  CUSTOMER_MATERIAL_GROUP: "Khách hàng + nhóm vật liệu",
  CUSTOMER_TIER: "Hạng khách hàng",
  DEFAULT: "Giá mặc định",
} as const;

function formatMoney(value: string, currency = "VND") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value} ${currency}`;
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(numeric);
}

function SubmitButton({ label = "Lưu dữ liệu" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button master-submit" disabled={pending} type="submit">
      <PackageCheck aria-hidden="true" size={19} />
      {pending ? "Đang lưu…" : label}
    </button>
  );
}

function ManagedForm({
  kind,
  title,
  initialKey,
  children,
  submitLabel,
}: {
  kind: Customer360EntityKind;
  title: string;
  initialKey: string;
  children: ReactNode;
  submitLabel?: string;
}) {
  const initialState: Customer360ActionState = {
    status: "idle",
    message: "",
    idempotencyKey: initialKey,
  };
  const [state, action] = useActionState(saveCustomer360Action, initialState);

  return (
    <details className="master-form-disclosure">
      <summary>
        <Plus aria-hidden="true" size={20} />
        {title}
      </summary>
      <form action={action} className="master-form">
        <input name="kind" type="hidden" value={kind} />
        <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
        <div className="master-form-grid">{children}</div>
        <SubmitButton label={submitLabel} />
        {state.message ? (
          <p
            aria-live="polite"
            className={state.status === "error" ? "form-error compact" : "form-success"}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "master-field master-field-wide" : "master-field"}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return (
    <tr>
      <td className="empty-table-cell" colSpan={columns}>
        {label}
      </td>
    </tr>
  );
}

export function Customer360Workspace({
  data,
  initialKeys,
  today,
  canManageCustomers,
  canManagePricing,
  canManageCredit,
  canOverrideCredit,
}: {
  data: Customer360Snapshot;
  initialKeys: Record<Customer360EntityKind, string>;
  today: string;
  canManageCustomers: boolean;
  canManagePricing: boolean;
  canManageCredit: boolean;
  canOverrideCredit: boolean;
}) {
  const [tab, setTab] = useState<WorkspaceTab>("profile");
  const [customerId, setCustomerId] = useState(data.customers[0]?.id ?? "");
  const [materialId, setMaterialId] = useState(data.materials[0]?.id ?? "");
  const [priceDate, setPriceDate] = useState(today);
  const [orderAmount, setOrderAmount] = useState("50000000");
  const [priceScope, setPriceScope] = useState<PriceRuleScope>("CUSTOMER_MATERIAL");

  const customer = data.customers.find((item) => item.id === customerId) ?? data.customers[0];
  const material = data.materials.find((item) => item.id === materialId) ?? data.materials[0];
  const contacts = data.contacts.filter((item) => item.customerId === customer?.id);
  const sites = data.sites.filter((item) => item.customerId === customer?.id);
  const timeline = data.timeline.filter((item) => item.customerId === customer?.id);
  const finance = data.financeSummaries.find((item) => item.customerId === customer?.id);
  const exposure = data.creditExposures.find((item) => item.customerId === customer?.id);
  const policy = data.creditPolicies
    .filter(
      (item) =>
        item.customerId === customer?.id &&
        item.validFrom <= today &&
        (!item.validTo || item.validTo >= today),
    )
    .sort((left, right) => right.version - left.version)[0];

  const resolvedPrice = useMemo(() => {
    if (!customer || !material) return null;
    return resolveCustomerPrice(data.priceRules, customer, material, priceDate);
  }, [customer, data.priceRules, material, priceDate]);

  const creditDecision = useMemo(() => {
    if (!exposure) return null;
    try {
      return evaluateCustomerCredit({ policy: policy ?? null, exposure, orderAmount });
    } catch {
      return null;
    }
  }, [exposure, orderAmount, policy]);

  const blockedCustomers = data.creditExposures.filter((item) => {
    const currentPolicy = data.creditPolicies
      .filter(
        (policyItem) =>
          policyItem.customerId === item.customerId &&
          policyItem.validFrom <= today &&
          (!policyItem.validTo || policyItem.validTo >= today),
      )
      .sort((left, right) => right.version - left.version)[0];
    return evaluateCustomerCredit({ policy: currentPolicy ?? null, exposure: item, orderAmount: "0" }).status === "BLOCKED";
  }).length;

  return (
    <div className="customer-workspace">
      <header className="master-page-header customer-page-header">
        <div>
          <p className="page-context">Bán hàng · Khách hàng</p>
          <h1>Khách hàng & giá bán</h1>
          <p>
            Xem một hồ sơ đầy đủ, tìm đúng giá đang hiệu lực và kiểm tra tín dụng trước khi bán.
          </p>
        </div>
        <label className="customer-picker">
          <span>Khách hàng đang xem</span>
          <select
            aria-label="Khách hàng đang xem"
            onChange={(event) => setCustomerId(event.target.value)}
            value={customer?.id ?? ""}
          >
            {data.customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="master-metrics" aria-label="Tóm tắt khách hàng">
        <div><strong>{data.customers.filter((item) => item.isActive).length}</strong><span>Khách hàng đang hoạt động</span></div>
        <div><strong>{data.priceRules.filter((item) => !item.validTo).length}</strong><span>Quy tắc giá hiện hành</span></div>
        <div><strong>{blockedCustomers}</strong><span>Khách hàng đang bị chặn tín dụng</span></div>
      </section>

      <div className="master-tabs" role="tablist" aria-label="Nội dung khách hàng">
        <button aria-selected={tab === "profile"} onClick={() => setTab("profile")} role="tab" type="button">
          <UsersRound aria-hidden="true" size={20} /> Hồ sơ 360°
        </button>
        <button aria-selected={tab === "pricing"} onClick={() => setTab("pricing")} role="tab" type="button">
          <CircleDollarSign aria-hidden="true" size={20} /> Giá bán
        </button>
        <button aria-selected={tab === "credit"} onClick={() => setTab("credit")} role="tab" type="button">
          <CreditCard aria-hidden="true" size={20} /> Tín dụng
        </button>
      </div>

      {tab === "profile" ? (
        <div className="customer-tab-panel" role="tabpanel">
          {customer ? (
            <>
              <section className="customer-profile-grid" aria-label="Hồ sơ khách hàng">
                <article className="customer-card customer-identity-card">
                  <div className="customer-card-title"><Building2 aria-hidden="true" size={24} /><h2>{customer.name}</h2></div>
                  <dl>
                    <div><dt>Mã khách hàng</dt><dd>{customer.code}</dd></div>
                    <div><dt>Hạng</dt><dd>{TIER_LABELS[customer.tier]}</dd></div>
                    <div><dt>Mã số thuế</dt><dd>{customer.taxCode ?? "Chưa có"}</dd></div>
                    <div><dt>Điện thoại</dt><dd>{customer.phone ?? "Chưa có"}</dd></div>
                    <div><dt>Trạng thái</dt><dd>{customer.isActive ? "Đang giao dịch" : "Tạm ngưng"}</dd></div>
                  </dl>
                </article>
                <article className="customer-card">
                  <div className="customer-card-title"><ContactRound aria-hidden="true" size={24} /><h2>Người liên hệ</h2></div>
                  {contacts.length ? contacts.map((contact) => (
                    <div className="contact-record" key={contact.id}>
                      <strong>{contact.name}{contact.isPrimary ? " · Chính" : ""}</strong>
                      <span>{contact.role ?? "Chưa ghi vai trò"}</span>
                      <span>{contact.phone ?? contact.email ?? "Chưa có thông tin liên hệ"}</span>
                    </div>
                  )) : <p className="empty-inline">Chưa có người liên hệ.</p>}
                </article>
                <article className="customer-card">
                  <div className="customer-card-title"><MapPin aria-hidden="true" size={24} /><h2>Địa điểm giao hàng</h2></div>
                  {sites.length ? sites.map((site) => (
                    <div className="contact-record" key={site.id}>
                      <strong>{site.name}{site.isDefault ? " · Mặc định" : ""}</strong>
                      <span>{site.address}</span>
                      {site.deliveryNotes ? <small>{site.deliveryNotes}</small> : null}
                    </div>
                  )) : <p className="empty-inline">Chưa có địa điểm giao hàng.</p>}
                </article>
              </section>

              {finance ? (
                <section className="finance-summary" aria-labelledby="finance-summary-title">
                  <div className="section-heading compact-heading">
                    <span className="section-icon" aria-hidden="true"><CircleDollarSign size={24} /></span>
                    <div><h2 id="finance-summary-title">Tóm tắt tài chính</h2><p>Khoản phải thu và tiền ứng trước được trình bày riêng, không bù trừ thành số âm.</p></div>
                  </div>
                  <div className="finance-numbers">
                    <div><span>Doanh thu tích lũy</span><strong>{formatMoney(finance.lifetimeRevenue)}</strong></div>
                    <div><span>Phải thu</span><strong>{formatMoney(finance.receivableAmount)}</strong></div>
                    <div><span>Quá hạn</span><strong>{formatMoney(finance.overdueAmount)}</strong></div>
                    <div><span>Tiền khách ứng trước</span><strong>{formatMoney(finance.customerAdvanceAmount)}</strong></div>
                  </div>
                </section>
              ) : null}

              <section className="timeline-section" aria-labelledby="customer-timeline-title">
                <div className="section-heading compact-heading">
                  <span className="section-icon" aria-hidden="true"><History size={24} /></span>
                  <div><h2 id="customer-timeline-title">Dòng thời gian khách hàng</h2><p>Các thay đổi quan trọng được giữ theo thời điểm xảy ra.</p></div>
                </div>
                <ol className="customer-timeline">
                  {timeline.length ? timeline.map((event) => (
                    <li key={event.id}>
                      <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleDateString("vi-VN")}</time>
                      <div><strong>{event.title}</strong>{event.detail ? <p>{event.detail}</p> : null}</div>
                    </li>
                  )) : <li className="empty-inline">Chưa có sự kiện.</li>}
                </ol>
              </section>
            </>
          ) : <p className="empty-inline">Hãy tạo khách hàng đầu tiên.</p>}

          {canManageCustomers ? (
            <section className="customer-form-stack" aria-label="Cập nhật hồ sơ khách hàng">
              <ManagedForm kind="customer" title="Thêm hoặc cập nhật khách hàng" initialKey={initialKeys.customer}>
                <Field label="Mã khách hàng"><input name="code" required /></Field>
                <Field label="Tên giao dịch"><input name="name" required /></Field>
                <Field label="Tên pháp lý" wide><input name="legalName" /></Field>
                <Field label="Mã số thuế"><input name="taxCode" /></Field>
                <Field label="Hạng khách hàng"><select name="tier" defaultValue="STANDARD">{Object.entries(TIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Điện thoại"><input name="phone" /></Field>
                <Field label="Email"><input name="email" type="email" /></Field>
              </ManagedForm>
              <ManagedForm kind="contact" title="Thêm người liên hệ" initialKey={initialKeys.contact}>
                <Field label="Khách hàng"><select name="customerId" defaultValue={customer?.id}>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Tên người liên hệ"><input name="name" required /></Field>
                <Field label="Vai trò"><input name="role" /></Field>
                <Field label="Điện thoại"><input name="phone" /></Field>
                <Field label="Email"><input name="email" type="email" /></Field>
                <Field label="Liên hệ chính"><input name="isPrimary" type="checkbox" /></Field>
              </ManagedForm>
              <ManagedForm kind="site" title="Thêm hoặc cập nhật địa điểm giao hàng" initialKey={initialKeys.site}>
                <Field label="Khách hàng"><select name="customerId" defaultValue={customer?.id}>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Mã địa điểm"><input name="code" required /></Field>
                <Field label="Tên địa điểm"><input name="name" required /></Field>
                <Field label="Địa chỉ" wide><input name="address" required /></Field>
                <Field label="Lưu ý giao hàng" wide><input name="deliveryNotes" /></Field>
                <Field label="Địa điểm mặc định"><input name="isDefault" type="checkbox" /></Field>
              </ManagedForm>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "pricing" ? (
        <div className="customer-tab-panel" role="tabpanel">
          <section className="price-resolver" aria-labelledby="price-resolver-title">
            <div className="section-heading compact-heading">
              <span className="section-icon" aria-hidden="true"><Calculator size={24} /></span>
              <div><h2 id="price-resolver-title">Tìm giá đang áp dụng</h2><p>Ưu tiên lần lượt: khách + vật liệu, khách + nhóm, hạng khách, giá mặc định.</p></div>
            </div>
            <div className="calculator-grid">
              <Field label="Vật liệu" wide><select value={material?.id ?? ""} onChange={(event) => setMaterialId(event.target.value)}>{data.materials.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></Field>
              <Field label="Ngày áp dụng"><input type="date" value={priceDate} onChange={(event) => setPriceDate(event.target.value)} /></Field>
              <div className="conversion-result price-result" aria-live="polite">
                <small>{resolvedPrice ? SCOPE_LABELS[resolvedPrice.scope] : "Chưa có giá phù hợp"}</small>
                <strong>{resolvedPrice ? `${formatMoney(resolvedPrice.unitPrice, resolvedPrice.currency)}/${resolvedPrice.uomSymbol}` : "—"}</strong>
                {resolvedPrice ? <span>Version {resolvedPrice.version} · từ {new Date(resolvedPrice.validFrom).toLocaleDateString("vi-VN")}</span> : <span>Không được tự nhập giá bỏ qua quy tắc.</span>}
              </div>
            </div>
          </section>

          <section aria-labelledby="price-history-title">
            <div className="section-heading compact-heading"><span className="section-icon" aria-hidden="true"><History size={24} /></span><div><h2 id="price-history-title">Lịch sử quy tắc giá</h2><p>Mỗi thay đổi tạo version mới; version cũ chỉ được đóng ngày hiệu lực.</p></div></div>
            <div className="master-table-wrap"><table><thead><tr><th>Tầng ưu tiên</th><th>Đối tượng</th><th>Đơn giá</th><th>Hiệu lực</th><th>Version</th></tr></thead><tbody>
              {data.priceRules.length ? data.priceRules.map((rule) => (
                <tr key={rule.id}><td>{SCOPE_LABELS[rule.scope]}</td><td>{rule.customerName ?? (rule.customerTier ? `Hạng ${TIER_LABELS[rule.customerTier]}` : "Mọi khách hàng")}<small>{rule.materialName ?? rule.materialGroupName}</small></td><td>{formatMoney(rule.unitPrice, rule.currency)}/{rule.uomSymbol}</td><td>{rule.validFrom} → {rule.validTo ?? "Hiện tại"}</td><td>v{rule.version}<small>{rule.changeReason}</small></td></tr>
              )) : <EmptyRow columns={5} label="Chưa có quy tắc giá." />}
            </tbody></table></div>
          </section>

          {canManagePricing ? (
            <ManagedForm kind="price-rule" title="Tạo version giá mới" initialKey={initialKeys["price-rule"]}>
              <Field label="Tầng ưu tiên"><select name="scope" value={priceScope} onChange={(event) => setPriceScope(event.target.value as PriceRuleScope)}>{Object.entries(SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              {priceScope === "CUSTOMER_MATERIAL" || priceScope === "CUSTOMER_MATERIAL_GROUP" ? <Field label="Khách hàng"><select name="customerId" defaultValue={customer?.id}>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : null}
              {priceScope === "CUSTOMER_TIER" ? <Field label="Hạng khách hàng"><select name="customerTier" defaultValue="STANDARD">{Object.entries(TIER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field> : null}
              {priceScope === "CUSTOMER_MATERIAL_GROUP" ? <Field label="Nhóm vật liệu"><select name="materialGroupId">{data.materialGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field> : <Field label="Vật liệu"><select name="materialId" defaultValue={material?.id}>{data.materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
              <Field label="Đơn giá"><input inputMode="decimal" min="0.01" name="unitPrice" required type="number" /></Field>
              <Field label="Tiền tệ"><input name="currency" defaultValue="VND" maxLength={3} required /></Field>
              <Field label="Đơn vị giá"><select name="uomId">{data.uoms.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.symbol})</option>)}</select></Field>
              <Field label="Ngày hiệu lực"><input name="validFrom" min={today} defaultValue={today} required type="date" /></Field>
              <Field label="Lý do thay đổi" wide><input name="changeReason" required /></Field>
            </ManagedForm>
          ) : null}
        </div>
      ) : null}

      {tab === "credit" ? (
        <div className="customer-tab-panel" role="tabpanel">
          <section className="credit-check" aria-labelledby="credit-check-title">
            <div className="section-heading compact-heading"><span className="section-icon" aria-hidden="true"><ShieldAlert size={24} /></span><div><h2 id="credit-check-title">Kiểm tra tín dụng trước khi bán</h2><p>Đơn bị chặn không thể tiếp tục nếu người duyệt không có quyền và lý do hợp lệ.</p></div></div>
            {exposure ? (
              <div className="credit-layout">
                <div className="credit-input"><Field label="Giá trị đơn dự kiến"><input inputMode="decimal" min="0" onChange={(event) => setOrderAmount(event.target.value)} type="number" value={orderAmount} /></Field><dl><div><dt>Phải thu</dt><dd>{formatMoney(exposure.receivableAmount)}</dd></div><div><dt>Đơn chưa xuất hóa đơn</dt><dd>{formatMoney(exposure.uninvoicedOrderAmount)}</dd></div><div><dt>Tiền khách ứng trước</dt><dd>{formatMoney(exposure.customerAdvanceAmount)}</dd></div></dl></div>
                <div className={creditDecision?.status === "CLEAR" ? "credit-decision clear" : "credit-decision blocked"} aria-live="polite">
                  <small>Kết quả kiểm tra</small><strong>{creditDecision?.status === "CLEAR" ? "Có thể bán" : "Bị chặn tín dụng"}</strong>
                  <span>Dư nợ dự kiến: {creditDecision ? formatMoney(creditDecision.projectedExposure) : "—"}</span>
                  {creditDecision?.reasons.map((reason) => <p key={reason}>{reason}</p>)}
                </div>
              </div>
            ) : <p className="empty-inline">Chưa có dữ liệu mức sử dụng tín dụng.</p>}
          </section>

          <section aria-labelledby="credit-policy-title">
            <div className="section-heading compact-heading"><span className="section-icon" aria-hidden="true"><CreditCard size={24} /></span><div><h2 id="credit-policy-title">Chính sách tín dụng</h2><p>Lịch sử hạn mức được version hóa theo ngày hiệu lực.</p></div></div>
            <div className="master-table-wrap"><table><thead><tr><th>Khách hàng</th><th>Hạn mức</th><th>Quá hạn cho phép</th><th>Hiệu lực</th><th>Version</th></tr></thead><tbody>
              {data.creditPolicies.length ? data.creditPolicies.map((item) => <tr key={item.id}><td>{data.customers.find((customerItem) => customerItem.id === item.customerId)?.name ?? item.customerId}</td><td>{formatMoney(item.creditLimit)}</td><td>{item.allowedOverdueDays} ngày</td><td>{item.validFrom} → {item.validTo ?? "Hiện tại"}</td><td>v{item.version}<small>{item.changeReason}</small></td></tr>) : <EmptyRow columns={5} label="Chưa có chính sách tín dụng." />}
            </tbody></table></div>
          </section>

          {canManageCredit ? (
            <ManagedForm kind="credit-policy" title="Tạo version chính sách tín dụng" initialKey={initialKeys["credit-policy"]}>
              <Field label="Khách hàng"><select name="customerId" defaultValue={customer?.id}>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Hạn mức tín dụng"><input inputMode="decimal" min="0" name="creditLimit" required type="number" /></Field>
              <Field label="Số ngày quá hạn cho phép"><input min="0" max="365" name="allowedOverdueDays" required type="number" /></Field>
              <Field label="Ngày hiệu lực"><input name="validFrom" min={today} defaultValue={today} required type="date" /></Field>
              <Field label="Lý do thay đổi" wide><input name="changeReason" required /></Field>
            </ManagedForm>
          ) : null}

          {canOverrideCredit ? (
            <ManagedForm kind="credit-override" title="Phê duyệt vượt chặn tín dụng" initialKey={initialKeys["credit-override"]} submitLabel="Phê duyệt có kiểm soát">
              <Field label="Khách hàng"><select name="customerId" defaultValue={customer?.id}>{data.customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Giá trị dự kiến"><input name="orderAmount" min="0.01" defaultValue={orderAmount} required type="number" /></Field>
              <Field label="Lý do vượt chặn" wide><input name="reason" minLength={10} required /></Field>
              <p className="risk-notice master-field-wide">Hành động này không thay đổi số dư. Hệ thống lưu người duyệt, lý do và ảnh chụp mức sử dụng tín dụng để audit.</p>
            </ManagedForm>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
