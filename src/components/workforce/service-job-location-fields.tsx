"use client";

import { useRef, useState } from "react";
import {
  searchServiceJobCustomersAction,
  searchServiceJobSitesAction,
  type ServiceJobCustomerOption,
  type ServiceJobSiteOption,
} from "@/modules/workforce/form-lookup-actions";

/** `initialCustomer`/`initialSite` pre-select the location when the job is started from an order or a customer (D9). */
export function ServiceJobLocationFields({ initialCustomers, initialCustomer, initialSite }: { initialCustomers: ServiceJobCustomerOption[]; initialCustomer?: ServiceJobCustomerOption; initialSite?: ServiceJobSiteOption }) {
  const [customers, setCustomers] = useState(() => initialCustomer && !initialCustomers.some((item) => item.id === initialCustomer.id) ? [initialCustomer, ...initialCustomers] : initialCustomers);
  const [sites, setSites] = useState<ServiceJobSiteOption[]>(initialSite ? [initialSite] : []);
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? "");
  const [siteId, setSiteId] = useState(initialSite?.id ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [siteSearch, setSiteSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const revision = useRef(0);

  async function findCustomers() {
    setBusy(true);
    setNotice("");
    try {
      const results = await searchServiceJobCustomersAction(customerSearch);
      setCustomers((current) => {
        const selected = current.find((item) => item.id === customerId);
        return selected && !results.some((item) => item.id === selected.id) ? [selected, ...results] : results;
      });
    } catch {
      setNotice("Không thể tìm khách hàng. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function findSites(nextCustomerId: string, term: string) {
    const currentRevision = ++revision.current;
    if (!nextCustomerId) {
      setSites([]);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const results = await searchServiceJobSitesAction(nextCustomerId, term);
      if (currentRevision === revision.current) {
        setSites((current) => {
          const selected = current.find((item) => item.id === siteId && item.customer_id === nextCustomerId);
          return selected && !results.some((item) => item.id === selected.id) ? [selected, ...results] : results;
        });
      }
    } catch {
      if (currentRevision === revision.current) setNotice("Không thể tìm công trình. Vui lòng thử lại.");
    } finally {
      if (currentRevision === revision.current) setBusy(false);
    }
  }

  return <>
    <div className="field">
      <label htmlFor="service-customer">Khách hàng</label>
      <div className="field-label-row"><input aria-label="Tìm khách hàng dịch vụ" type="search" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Mã hoặc tên khách" /><button className="button button-secondary" type="button" disabled={busy} onClick={findCustomers}>Tìm khách</button></div>
      <select id="service-customer" name="customerId" value={customerId} required onChange={(event) => { const nextId = event.target.value; setCustomerId(nextId); setSiteId(""); setSiteSearch(""); void findSites(nextId, ""); }}><option value="">Chọn khách</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.display_name}</option>)}</select>
    </div>
    <div className="field">
      <label htmlFor="service-site">Địa điểm</label>
      <div className="field-label-row"><input aria-label="Tìm công trình dịch vụ" type="search" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} placeholder="Tên công trình" disabled={!customerId} /><button className="button button-secondary" type="button" disabled={!customerId || busy} onClick={() => void findSites(customerId, siteSearch)}>Tìm điểm</button></div>
      <select id="service-site" name="siteId" value={siteId} required disabled={!customerId} onChange={(event) => setSiteId(event.target.value)}><option value="">Chọn điểm</option>{sites.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </div>
    {notice && <p className="field-full" role="status">{notice}</p>}
  </>;
}
