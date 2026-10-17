import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PAYMENT_NOTICES_ENABLED } from "@/lib/features";

/** Owner decision D8: the payment-notice screens are switched off while the flag is off. */
export default function PaymentNoticesLayout({ children }: { children: ReactNode }) {
  if (!PAYMENT_NOTICES_ENABLED) notFound();
  return children;
}
