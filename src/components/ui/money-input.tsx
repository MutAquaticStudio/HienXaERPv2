"use client";

import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "pattern" | "name"> & {
  /** Form field that receives the whole-đồng digits ("60000"); the visible box itself has no name. */
  name?: string;
  /** Controlled whole-đồng digits. */
  value?: string;
  /** Uncontrolled starting amount (digits). */
  defaultValue?: string | number | bigint | null;
  onValue?: (digits: string) => void;
  /** Signed adjustments may start with a minus. */
  allowNegative?: boolean;
  maxDigits?: number;
};

/** Fired on a form field after a saved draft value was written back into it (see ReliableCommandForm). */
export const RESTORED_EVENT = "hx-restore";

/** Whole đồng from what was typed or pasted: "60.000", "60,000 đ" and "60000" all give "60000". */
export function moneyDigits(raw: string, allowNegative = false, maxDigits = 19): string {
  const negative = allowNegative && raw.trim().startsWith("-");
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, maxDigits);
  return negative ? `-${digits}` : digits;
}

/** "-1250000" → "-1.250.000", the grouping every amount in the app is shown with. */
export function groupMoney(digits: string): string {
  const negative = digits.startsWith("-");
  const body = negative ? digits.slice(1) : digits;
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return negative ? `-${grouped}` : grouped;
}

function digitsBefore(text: string, caret: number) {
  return text.slice(0, caret).replace(/[^\d-]/g, "").length;
}

function caretAfter(text: string, count: number) {
  if (count <= 0) return 0;
  let seen = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (/[\d-]/.test(text[index])) seen += 1;
    if (seen === count) return index + 1;
  }
  return text.length;
}

function initialDigits(value: Props["defaultValue"], allowNegative: boolean, maxDigits: number) {
  return value === null || value === undefined ? "" : moneyDigits(String(value), allowNegative, maxDigits);
}

/**
 * Amount box that groups thousands while typing (60000 → 60.000) and keeps the cursor where the user is typing.
 * It posts plain digits through a hidden input, so server actions keep reading whole đồng.
 */
export function MoneyInput({ name, value, defaultValue, onValue, allowNegative = false, maxDigits = 19, ...props }: Props) {
  const controlled = value !== undefined;
  const [own, setOwn] = useState(() => initialDigits(defaultValue, allowNegative, maxDigits));
  const digits = controlled ? moneyDigits(value, allowNegative, maxDigits) : own;
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const text = groupMoney(digits);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || pendingCaret.current === null || document.activeElement !== input) return;
    const position = caretAfter(text, pendingCaret.current);
    input.setSelectionRange(position, position);
    pendingCaret.current = null;
  }, [text]);

  // A form reset (after a successful submit) should bring back the starting amount, like a plain input does.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || controlled) return;
    const reset = () => setOwn(initialDigits(defaultValue, allowNegative, maxDigits));
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, defaultValue, allowNegative, maxDigits]);

  // A restored draft writes the posted digits straight into the hidden field; show them in the box too.
  useEffect(() => {
    const hidden = hiddenRef.current;
    if (!hidden) return;
    const resync = () => {
      const restored = moneyDigits(hidden.value, allowNegative, maxDigits);
      if (!controlled) setOwn(restored);
      onValue?.(restored);
    };
    hidden.addEventListener(RESTORED_EVENT, resync);
    return () => hidden.removeEventListener(RESTORED_EVENT, resync);
  }, [controlled, onValue, allowNegative, maxDigits]);

  return <>
    <input ref={inputRef} {...props} type="text" inputMode="numeric" autoComplete="off" value={text}
      onChange={(event) => {
        const raw = event.target.value;
        pendingCaret.current = digitsBefore(raw, event.target.selectionStart ?? raw.length);
        const next = moneyDigits(raw, allowNegative, maxDigits);
        if (!controlled) setOwn(next);
        onValue?.(next);
      }} />
    {name && <input ref={hiddenRef} type="hidden" name={name} value={digits === "-" ? "" : digits} />}
  </>;
}
