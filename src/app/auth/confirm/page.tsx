import type { Metadata } from "next";

import { SignupConfirm } from "@/components/auth/signup-confirm";

export const metadata: Metadata = { title: "Xác nhận email · Hiền Xa" };

/** D67: the link of the sign-up confirmation email lands here, on the shop's own address (not a Supabase address). */
export default function AuthConfirmPage() {
  return <SignupConfirm />;
}
