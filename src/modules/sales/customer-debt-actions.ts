"use server";

import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export type CustomerDebt = { outstandingVnd: string; overdueVnd: string; openCount: number };

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/**
 * Current and overdue receivable of one customer in the active branch, for the "Xác nhận đơn" review (D6).
 * `null` without receivable rights or when it cannot be read: the review then simply does not show debt.
 */
export async function loadCustomerDebtAction(customerId: string): Promise<CustomerDebt | null> {
  const access = await requireInternalAccess();
  if (!access.permissions.has("finance.ar.read") || !z.uuid().safeParse(customerId).success) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("receivable_read").select("outstanding_amount_vnd::text, due_date")
    .eq("branch_id", access.branchId).eq("customer_id", customerId).gt("outstanding_amount_vnd", 0).limit(1000);
  if (error) return null;
  const today = businessToday();
  const rows = (data ?? []) as unknown as { outstanding_amount_vnd: string; due_date: string | null }[];
  const sum = (items: typeof rows) => items.reduce((total, row) => total + BigInt(row.outstanding_amount_vnd), 0n).toString();
  return { outstandingVnd: sum(rows), overdueVnd: sum(rows.filter((row) => row.due_date !== null && row.due_date < today)), openCount: rows.length };
}
