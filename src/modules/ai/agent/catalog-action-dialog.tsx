"use client";

// D65: "Xem và sửa" on a card that creates a catalog record (customer, supplier, material): the real create form of the screen
// ("Thêm nhà cung cấp"…) opens in a popup with the assistant's values filled in. Saving it saves the record with the card's own
// operation id and marks the card done; a new customer with an address then gets the first-site form, also filled in.
import { useEffect, useRef, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { CatalogDialog } from "@/modules/catalog/catalog-dialog";
import { finishAiCatalogActionAction, loadAiCatalogFormAction, type AiActionCard, type CatalogFormProps } from "./actions";

type Stage = { name: "loading" } | { name: "error"; message: string } | { name: "main"; form: CatalogFormProps } | { name: "site"; form: CatalogFormProps };

export function CatalogActionDialog({ card, onClose, onDone }: { card: AiActionCard; onClose: () => void; onDone: (card: AiActionCard) => void }) {
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [problem, setProblem] = useState("");
  const site = useRef<CatalogFormProps | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    let live = true;
    loadAiCatalogFormAction({ actionId: card.id }).then((result) => { if (live) setStage(result.ok ? { name: "main", form: result.form } : { name: "error", message: result.message }); },
      () => { if (live) setStage({ name: "error", message: "Chưa mở được form. Thử lại." }); });
    return () => { live = false; };
  }, [card.id]);

  // The record is saved: read the site form while the card still waits, then mark the card done.
  async function saved() {
    if (finishing.current) return;
    finishing.current = true;
    if (card.catalog?.site) site.current = await loadAiCatalogFormAction({ actionId: card.id, site: true }).then((result) => result.ok ? result.form : null, () => null);
    const outcome = await finishAiCatalogActionAction({ actionId: card.id }).catch(() => null);
    if (!outcome?.ok || !outcome.card) { setProblem(outcome?.message ?? "Đã lưu nhưng chưa cập nhật được thẻ. Mở lại chat để thấy thẻ đã xong."); finishing.current = false; return; }
    onDone(outcome.card);
    if (site.current) setStage({ name: "site", form: site.current });
    // A new material stays open: its units and prices are added in the same form.
    else if (stage.name === "main" && stage.form.kind !== "materials") onClose();
  }

  if (stage.name === "loading") return <Dialog title="Đang mở form…" onClose={onClose}><p className="muted" role="status">Đang chuẩn bị form đã điền sẵn…</p></Dialog>;
  if (stage.name === "error") return <Dialog title="Chưa mở được form" onClose={onClose}><p className="form-message error" role="alert">{stage.message}</p></Dialog>;
  const { form } = stage;
  return <>
    {problem && <p className="form-message error ai-form-problem" role="alert">{problem}</p>}
    <CatalogDialog key={stage.name} kind={form.kind} options={form.options} permissions={form.permissions} initial={form.initial} scope={form.scope} operationId={form.operationId}
      onClose={onClose} onSaved={() => { if (stage.name === "main") void saved(); else onClose(); }} onCreated={() => { if (stage.name === "main") void saved(); }} />
  </>;
}
