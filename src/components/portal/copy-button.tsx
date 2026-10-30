"use client";

import { useState } from "react";
import styles from "@/components/portal/portal.module.css";

/** FB18: copies a value (account number, transfer note) and says so for two seconds. */
export function CopyButton({ value, label = "Sao chép" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }
  return <button type="button" className={styles.copyButton} onClick={copy} aria-live="polite">{copied ? "Đã chép" : label}</button>;
}
