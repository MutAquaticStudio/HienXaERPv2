import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { QUOTATIONS_ENABLED } from "@/lib/features";

/** Owner decision D1: every quotation screen is switched off while the flag is off. */
export default function QuotationsLayout({ children }: { children: ReactNode }) {
  if (!QUOTATIONS_ENABLED) notFound();
  return children;
}
