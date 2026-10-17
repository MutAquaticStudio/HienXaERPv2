"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";

type Party = { id: string; code: string; name: string };

/**
 * "Lập phiếu thu" / "Lập phiếu chi" in Sổ quỹ (FB2 Đợt 6): pick the customer or supplier, then the receipt or payment form
 * of Công nợ opens for them with their open items to allocate, exactly as "Ghi thu" / "Ghi chi" does there.
 */
export function PartyPaymentLauncher({ label, title, parties, hrefPrefix, partyLabel, className = "button button-secondary" }: {
  label: string;
  title: string;
  parties: Party[];
  /** Where the payment form for one party opens, completed with its id ("/admin/receivables?customer="). */
  hrefPrefix: string;
  partyLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState("");
  const term = query.trim().toLocaleLowerCase("vi");
  const matches = parties.filter((party) => !term || `${party.code} ${party.name}`.toLocaleLowerCase("vi").includes(term)).slice(0, 50);
  const searchId = `${label}-search`.replace(/\s+/g, "-");
  return <>
    <button type="button" className={className} onClick={() => { setOpen(true); setChosen(""); setQuery(""); }}>{label}</button>
    {open && <Dialog title={title} onClose={() => setOpen(false)} initialFocusId={searchId}>
      <div className="field"><label htmlFor={searchId}>Tìm {partyLabel}</label>
        <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mã hoặc tên" /></div>
      <div className="party-pick" role="radiogroup" aria-label={partyLabel}>
        {matches.map((party) => <label key={party.id} className={chosen === party.id ? "party-pick-item selected" : "party-pick-item"}>
          <input type="radio" name="party" value={party.id} checked={chosen === party.id} onChange={() => setChosen(party.id)} />
          <span><strong>{party.name}</strong><small className="table-subline mono">{party.code}</small></span>
        </label>)}
        {!matches.length && <p className="empty-inline">Không có {partyLabel} phù hợp.</p>}
      </div>
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Quay lại</button>
        <button type="button" className="button button-primary" disabled={!chosen} onClick={() => router.push(hrefPrefix + chosen)}>Tiếp tục</button>
      </div>
    </Dialog>}
  </>;
}
