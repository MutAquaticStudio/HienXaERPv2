// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { salesStateLabel } from "./presentation";

let db: PGlite;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`
    create table sales_orders (id uuid, branch_id uuid, order_number text, customer_id uuid, site_id uuid,
      quotation_revision_id uuid, sales_owner_employee_id uuid, commercial_state text, customer_name_snapshot text,
      site_name_snapshot text, delivery_address_snapshot text, requested_delivery_at timestamptz,
      confirmed_at timestamptz, cancelled_at timestamptz, created_at timestamptz);
    create table sales_order_lines (id uuid, sales_order_id uuid, quantity numeric, conversion_numerator numeric, conversion_denominator numeric, line_total_vnd bigint);
    create table deliveries (id uuid, sales_order_id uuid, execution_state text);
    create table delivery_lines (id uuid, sales_order_line_id uuid);
    create table delivery_verification_lines (delivery_line_id uuid, accepted_base_quantity numeric);
    create table delivery_verifications (id uuid, delivery_id uuid);
    create table customers (id uuid, display_name text);
    create table customer_sites (id uuid, name text);
    create table receivable_obligations (id uuid, branch_id uuid, customer_id uuid, site_id uuid,
      original_amount_vnd bigint, due_date date, recorded_at timestamptz, opening_source_id uuid, delivery_verification_id uuid);
    create table receivable_adjustments (obligation_id uuid, amount_delta_vnd bigint);
    create table payment_allocations (receivable_obligation_id uuid, amount_delta_vnd bigint);
  `);
  const finance = await readFile(new URL("../../../supabase/migrations/20260912123357_finance_dashboard.sql", import.meta.url), "utf8");
  const receivableView = finance.match(/create view public\.receivable_read with[\s\S]*?(?=\ncreate view public\.payable_read)/)?.[0];
  if (!receivableView) throw new Error("Canonical receivable view not found");
  await db.exec(receivableView);
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261001084145_fix_sales_order_payment_state.sql", import.meta.url), "utf8"));
}, 20000);
beforeEach(async () => {
  await db.exec("truncate sales_orders, sales_order_lines, deliveries, delivery_lines, delivery_verification_lines, delivery_verifications, customers, customer_sites, receivable_obligations, receivable_adjustments, payment_allocations;");
});
afterAll(async () => { await db?.close(); });

async function order() {
  const id = randomUUID();
  await db.query("insert into sales_orders(id, order_number, commercial_state) values ($1, 'SO-QA', 'CONFIRMED')", [id]);
  return id;
}
async function obligation(orderId: string, amount = 690000) {
  const id = randomUUID(), customerId = randomUUID(), deliveryId = randomUUID(), verificationId = randomUUID();
  await db.query("insert into customers values ($1, 'QA customer')", [customerId]);
  await db.query("insert into deliveries values ($1, $2, 'VERIFIED')", [deliveryId, orderId]);
  await db.query("insert into delivery_verifications values ($1, $2)", [verificationId, deliveryId]);
  await db.query("insert into receivable_obligations(id, customer_id, original_amount_vnd, delivery_verification_id) values ($1, $2, $3, $4)", [id, customerId, amount, verificationId]);
  return id;
}
async function allocate(id: string, amount: number) {
  await db.query("insert into payment_allocations values ($1, $2)", [id, amount]);
}
async function state(id: string) {
  return (await db.query<{ payment_state: string }>("select payment_state from sales_order_read where id=$1", [id])).rows[0].payment_state;
}

it("keeps an order without AR NOT_DUE rather than PAID", async () => {
  expect(await state(await order())).toBe("NOT_DUE");
});
it("derives UNPAID, PARTIAL and PAID from posted signed allocations", async () => {
  const id = await order(), ar = await obligation(id);
  expect(await state(id)).toBe("UNPAID");
  await allocate(ar, 300000);
  expect(await state(id)).toBe("PARTIAL");
  await allocate(ar, 390000);
  expect(await state(id)).toBe("PAID");
});
it("restores PARTIAL and UNPAID after allocation reversals", async () => {
  const id = await order(), ar = await obligation(id);
  await allocate(ar, 300000); await allocate(ar, 390000);
  await allocate(ar, -390000);
  expect(await state(id)).toBe("PARTIAL");
  await allocate(ar, -300000);
  expect(await state(id)).toBe("UNPAID");
});
it("does not mark a multi-delivery order PAID while one obligation remains outstanding", async () => {
  const id = await order(), first = await obligation(id, 240000), second = await obligation(id, 450000);
  await allocate(first, 240000);
  expect(await state(id)).toBe("PARTIAL");
  await allocate(second, 450000);
  expect(await state(id)).toBe("PAID");
});
it("uses canonical AR adjustments and excludes unrelated orders", async () => {
  const id = await order(), ar = await obligation(id);
  await obligation(await order(), 1000000);
  await db.query("insert into receivable_adjustments values ($1, -690000)", [ar]);
  expect(await state(id)).toBe("PAID");
});
it("keeps RLS invoker semantics on the replacement view", async () => {
  const result = await db.query<{ reloptions: string[] }>("select reloptions from pg_class where oid='public.sales_order_read'::regclass");
  expect(result.rows[0].reloptions).toContain("security_invoker=true");
});
it("renders canonical payment labels", () => {
  expect(["NOT_DUE", "UNPAID", "PARTIAL", "PAID"].map(salesStateLabel)).toEqual(["Chưa phát sinh", "Chưa thanh toán", "Thanh toán một phần", "Đã thanh toán"]);
});
