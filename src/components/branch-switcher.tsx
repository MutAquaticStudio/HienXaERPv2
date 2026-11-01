"use client";

import { Check, ChevronDown, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { selectBranchAction } from "@/lib/auth/actions";

export type BranchChoice = { id: string; name: string };

/** The section to come back to after switching: "/admin/orders/123" → "/admin/orders" (a record may belong to the old branch). */
export function branchReturnPath(pathname: string): string {
  const section = pathname.split("/").slice(0, 3).join("/");
  return /^\/(admin|work)(\/[a-z-]+)?$/.test(section) ? section : "/";
}

/** One button per branch; the server checks the person still works there before switching. */
export function BranchSwitchList({ branches, currentId, surface, pathname }: { branches: readonly BranchChoice[]; currentId?: string; surface: "admin" | "work"; pathname: string }) {
  return <ul className="branch-switch-list" role="list">
    {branches.map((branch) => {
      const current = branch.id === currentId;
      return <li key={branch.id}><form action={selectBranchAction}>
        <input type="hidden" name="branchId" value={branch.id} /><input type="hidden" name="surface" value={surface} />
        <input type="hidden" name="returnTo" value={branchReturnPath(pathname)} />
        <button type="submit" className="branch-switch-option" disabled={current} aria-current={current ? "true" : undefined}>
          <MapPin aria-hidden="true" size={15} /><span>{branch.name}</span>{current && <Check aria-hidden="true" size={15} />}
        </button>
      </form></li>;
    })}
  </ul>;
}

/** The branch chip in the top bar; with more than one branch it opens a short list to switch right away. */
export function BranchSwitcher({ branches, currentId, currentName, surface, pathname }: { branches: readonly BranchChoice[]; currentId?: string; currentName: string; surface: "admin" | "work"; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (branches.length < 2) return <span className="utility-branch"><MapPin aria-hidden="true" size={15} />{currentName}</span>;
  return <div className="branch-switch" ref={ref} onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); } }}>
    <button type="button" className="utility-branch utility-branch-button" aria-expanded={open} aria-controls="branch-switch-panel"
      aria-label={`Chi nhánh: ${currentName}. Đổi chi nhánh`} onClick={() => setOpen((value) => !value)}>
      <MapPin aria-hidden="true" size={15} /><span>{currentName}</span><ChevronDown className="nav-chevron" aria-hidden="true" size={14} />
    </button>
    <div id="branch-switch-panel" className="branch-switch-panel" hidden={!open}>
      <p className="branch-switch-head">Đổi chi nhánh</p>
      <BranchSwitchList branches={branches} currentId={currentId} surface={surface} pathname={pathname} />
    </div>
  </div>;
}
