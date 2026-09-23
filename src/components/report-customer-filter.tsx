"use client";

import { useRef, useState } from "react";

type Customer = { id: string; display_name: string };

export function ReportCustomerFilter({ report, initialSearch, initialCustomer, initialOptions }: {
  report: string;
  initialSearch: string;
  initialCustomer: string;
  initialOptions: Customer[];
}) {
  const [search, setSearch] = useState(initialSearch);
  const [selected, setSelected] = useState(initialCustomer);
  const [options, setOptions] = useState(initialOptions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestNumber = useRef(0);
  const selectedCustomer = useRef(initialCustomer);

  async function findCustomers() {
    const request = ++requestNumber.current;
    setBusy(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ report, q: search });
      const response = await fetch(`/api/reports/customers?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("lookup_failed");
      const body = await response.json() as { customers: Customer[] };
      if (request !== requestNumber.current) return;
      setOptions(previous => {
        const chosen = previous.find(customer => customer.id === selectedCustomer.current);
        return chosen && !body.customers.some(customer => customer.id === chosen.id)
          ? [chosen, ...body.customers] : body.customers;
      });
      const url = new URL(window.location.href);
      if (search.trim()) url.searchParams.set("customerSearch", search.trim());
      else url.searchParams.delete("customerSearch");
      window.history.replaceState(null, "", url);
      setMessage(body.customers.length ? `${body.customers.length} kết quả tìm kiếm.` : "Không tìm thấy khách hàng phù hợp.");
    } catch {
      if (request === requestNumber.current) setMessage("Không thể tìm khách hàng. Vui lòng thử lại.");
    } finally {
      if (request === requestNumber.current) setBusy(false);
    }
  }

  return <>
    <label>Tìm khách hàng<input type="search" name="customerSearch" value={search}
      onChange={event => { requestNumber.current += 1; setBusy(false); setMessage(""); setSearch(event.target.value); }} placeholder="Nhập tên khách hàng"
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void findCustomers(); } }} /></label>
    <button className="button button-secondary" type="button" disabled={busy}
      onClick={() => void findCustomers()}>{busy ? "Đang tìm..." : "Tìm khách"}</button>
    <label>Khách hàng<select name="customer" value={selected} onChange={event => { selectedCustomer.current = event.target.value; setSelected(event.target.value); }}>
      <option value="">Tất cả</option>
      {options.map(customer => <option value={customer.id} key={customer.id}>{customer.display_name}</option>)}
    </select></label>
    <span role="status" aria-live="polite">{message}</span>
  </>;
}
