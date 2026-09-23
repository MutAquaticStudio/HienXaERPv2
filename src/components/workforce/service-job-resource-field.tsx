"use client";

import { useState } from "react";
import {
  searchServiceJobResourcesAction,
  type ServiceJobResourceKind,
  type ServiceJobResourceOption,
} from "@/modules/workforce/form-lookup-actions";

export function ServiceJobResourceField({ kind, label, name, initialOptions }: {
  kind: ServiceJobResourceKind;
  label: string;
  name: string;
  initialOptions: ServiceJobResourceOption[];
}) {
  const [options, setOptions] = useState(initialOptions);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function find() {
    setBusy(true);
    setNotice("");
    try {
      const results = await searchServiceJobResourcesAction(kind, search);
      setOptions((current) => {
        const selected = current.find((item) => item.id === selectedId);
        return selected && !results.some((item) => item.id === selected.id) ? [selected, ...results] : results;
      });
    } catch {
      setNotice(`Không thể tìm ${label.toLowerCase()}. Vui lòng thử lại.`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="field">
    <label htmlFor={`service-${kind}`}>{label}</label>
    <div className="field-label-row"><input aria-label={`Tìm ${label.toLowerCase()}`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Mã hoặc tên ${label.toLowerCase()}`} /><button className="button button-secondary" type="button" disabled={busy} onClick={find}>Tìm</button></div>
    <select id={`service-${kind}`} name={name} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Không gắn</option>{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
