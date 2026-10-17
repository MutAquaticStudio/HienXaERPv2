"use client";

import Decimal from "decimal.js";
import { useState } from "react";
import { formatVnd, vnd } from "@/lib/core/money";
import { MoneyInput } from "@/components/ui/money-input";

/** Billable quantity × unit price in whole đồng (half up), or null while the quantity is not a valid number. */
export function suggestedBillableAmount(quantity: string, unitPriceVnd: string | null): string | null {
  const value = quantity.trim();
  if (!unitPriceVnd || !/^\d+(?:\.\d{1,6})?$/.test(value)) return null;
  return new Decimal(value).mul(unitPriceVnd).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0);
}

/**
 * D23: when the job carries the service type's unit price, "Giá trị tính khách" follows the billable quantity until the
 * verifier types an amount of their own; the amount stays editable either way.
 */
export function ServiceBillingFields({ defaultQuantity, unitLabel, unitPriceVnd }: { defaultQuantity: string; unitLabel: string; unitPriceVnd: string | null }) {
  const [quantity, setQuantity] = useState(defaultQuantity);
  const [amount, setAmount] = useState(() => suggestedBillableAmount(defaultQuantity, unitPriceVnd) ?? "");
  const [own, setOwn] = useState(false);
  const suggested = suggestedBillableAmount(quantity, unitPriceVnd);
  return <>
    <div className="field"><label htmlFor="billable-quantity">Sản lượng tính khách ({unitLabel})</label>
      <input id="billable-quantity" name="billableQuantity" value={quantity} inputMode="decimal" required
        onChange={(event) => { setQuantity(event.target.value); if (!own) setAmount(suggestedBillableAmount(event.target.value, unitPriceVnd) ?? ""); }} /></div>
    <div className="field"><label htmlFor="billable-amount">Giá trị tính khách (VND)</label>
      <MoneyInput id="billable-amount" name="billableAmount" value={amount} onValue={(digits) => { setAmount(digits); setOwn(true); }} required />
      {unitPriceVnd && <small className="muted">
        Đơn giá {formatVnd(vnd(unitPriceVnd))}/{unitLabel}{suggested ? ` · gợi ý ${formatVnd(vnd(suggested))}` : ""}
        {own && suggested && suggested !== amount && <> · <button type="button" className="link-button" onClick={() => { setAmount(suggested); setOwn(false); }}>Dùng giá gợi ý</button></>}
      </small>}
    </div>
  </>;
}
