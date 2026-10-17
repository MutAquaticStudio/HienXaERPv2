"use client";

import { useState, type ReactNode } from "react";

/**
 * "Ghi chi phí" (FB2 Đợt 6): one popup for both kinds of expense. A general expense and a trip expense tied to a handed-over
 * delivery and vehicle keep their own forms and commands (create_expense / create_delivery_expense).
 */
export function ExpenseCreateChooser({ general, trip }: { general: ReactNode; trip: ReactNode | null }) {
  const [kind, setKind] = useState<"general" | "trip">("general");
  return <div className="expense-create">
    {trip && <fieldset className="segmented-radio"><legend>Loại chi phí</legend>
      <label><input type="radio" name="expense-kind" checked={kind === "general"} onChange={() => setKind("general")} /> Chi phí chung</label>
      <label><input type="radio" name="expense-kind" checked={kind === "trip"} onChange={() => setKind("trip")} /> Chi phí chuyến (gắn phiếu giao và xe)</label>
    </fieldset>}
    {kind === "general" || !trip ? general : trip}
  </div>;
}
