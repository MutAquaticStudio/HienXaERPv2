"use client";

import Decimal from "decimal.js";
import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NumberEntry } from "@/components/documents/editor/number-entry";
import { RESTORED_EVENT } from "@/components/ui/money-input";
import { decimalForEditing, normalizeDecimalInput } from "@/lib/core/vn-number";

/** One step up or down from a quantity ("" counts as 0); null when the result would fall below the minimum. */
export function stepBy(value: string, step: 1 | -1, min: 0 | 1): string | null {
  const current = normalizeDecimalInput(value) ?? (value.trim() ? null : "0");
  if (current === null) return step > 0 ? String(Math.max(1, min)) : null;
  const next = new Decimal(current).plus(step);
  return next.gte(min) ? next.toFixed() : null;
}

/**
 * Quantity with big "−" / "+" buttons for counting trips or hours on a phone (FB8), typing still works ("2,5").
 * The canonical decimal is posted through a hidden input named `name`; empty stays empty when `allowEmpty`.
 */
export function QuantityStepper({ id, name, label, unit, value, defaultValue = "", onValue, min = 1, allowEmpty = false, placeholder, required, disabled, describedBy }: {
  id: string; name?: string; label: string; unit?: string;
  value?: string; defaultValue?: string; onValue?: (value: string) => void;
  min?: 0 | 1; allowEmpty?: boolean; placeholder?: string; required?: boolean; disabled?: boolean; describedBy?: string;
}) {
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue);
  const current = controlled ? value : own;
  const hidden = useRef<HTMLInputElement>(null);
  const set = (next: string) => { if (!controlled) setOwn(next); onValue?.(next); };

  // A form reset or a restored draft writes the hidden field; show it in the box too.
  useEffect(() => {
    const field = hidden.current;
    const form = field?.form;
    if (!field || controlled) return;
    const restored = () => setOwn(field.value);
    const reset = () => setOwn(defaultValue);
    field.addEventListener(RESTORED_EVENT, restored);
    form?.addEventListener("reset", reset);
    return () => { field.removeEventListener(RESTORED_EVENT, restored); form?.removeEventListener("reset", reset); };
  }, [controlled, defaultValue]);

  const down = stepBy(current, -1, min);
  // Below the minimum an optional quantity goes back to empty ("chưa biết").
  const clears = allowEmpty && down === null && normalizeDecimalInput(current) !== null;
  const invalid = current.trim() !== "" && normalizeDecimalInput(current) === null;
  return <span className="qty-stepper qty-stepper-large">
    <button type="button" className="qty-step" aria-label={`Bớt 1 · ${label}`} disabled={disabled || (down === null && !clears)}
      onClick={() => set(down ?? "")}><Minus size={18} aria-hidden="true" /></button>
    <NumberEntry id={id} aria-label={label} inputMode="decimal" value={current} normalize={normalizeDecimalInput} display={decimalForEditing}
      placeholder={placeholder} required={required && !allowEmpty} disabled={disabled} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      onValue={set} />
    {unit && <span className="qty-stepper-unit">{unit}</span>}
    <button type="button" className="qty-step" aria-label={`Thêm 1 · ${label}`} disabled={disabled}
      onClick={() => set(stepBy(current, 1, min) ?? String(Math.max(1, min)))}><Plus size={18} aria-hidden="true" /></button>
    {name && <input ref={hidden} type="hidden" name={name} value={normalizeDecimalInput(current) ?? current.trim()} />}
  </span>;
}
