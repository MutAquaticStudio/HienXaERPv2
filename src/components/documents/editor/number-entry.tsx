"use client";

import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "name"> & {
  value: string;
  onValue: (value: string) => void;
  /** Canonical value for the typed text, or null when it cannot be read. */
  normalize: (raw: string) => string | null;
  /** How a value set from outside (draft, stepper) is shown for editing. */
  display?: (value: string) => string;
};

const asIs = (value: string) => value;

/**
 * Keeps what the user typed ("1,5", "120.000") on screen while reporting the canonical value.
 * It has no form name on purpose: post the canonical value through a hidden input next to it.
 */
export const NumberEntry = forwardRef<HTMLInputElement, Props>(function NumberEntry({ value, onValue, normalize, display = asIs, ...props }, ref) {
  const [text, setText] = useState(() => display(value));
  const reported = useRef(value);
  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    setText(display(value));
  }, [value, display]);
  return <input ref={ref} {...props} value={text} onChange={(event) => {
    const raw = event.target.value;
    setText(raw);
    const next = normalize(raw) ?? raw;
    reported.current = next;
    onValue(next);
  }} />;
});
