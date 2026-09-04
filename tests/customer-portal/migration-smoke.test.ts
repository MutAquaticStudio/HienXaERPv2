import { readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { expect, it } from "vitest";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không lấy được cổng PostgreSQL kiểm thử.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

it("applies CP1 and keeps customer commands within their existing P4/P7/P8 sources", async () => {
  const port = await reservePort();
  const databaseDir = join(tmpdir(), `hienxa-cp1-migration-${process.pid}-${port}`);
  const database = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "hienxa-test-only", authMethod: "scram-sha-256", persistent: false, onLog: () => undefined, onError: () => undefined });
  const client = database.getPgClient("postgres", "127.0.0.1");
  let started = false;
  try {
    await database.initialise(); await database.start(); started = true; await client.connect();
    await client.query(`
      create role anon noinherit; create role authenticated noinherit;
      create schema auth; create schema app_private; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      create function storage.foldername(name text) returns text[] language sql immutable as 'select string_to_array(name, ''/'')';
      create table storage.buckets (id text primary key, name text not null, public boolean not null, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (bucket_id text not null, name text not null, owner_id uuid, primary key(bucket_id, name));
      create table public.user_profiles (user_id uuid primary key references auth.users(id), display_name text not null);
      create table public.audit_events (id uuid primary key default gen_random_uuid(), actor_user_id uuid references public.user_profiles(user_id), event_type text not null, entity_type text not null, entity_id uuid, payload jsonb not null default '{}'::jsonb);
      create table public.customers (id uuid primary key, name_vi text not null, is_active boolean not null default true);
      create table public.customer_sites (id uuid primary key, customer_id uuid not null references public.customers(id), is_active boolean not null default true);
      create table public.uom_catalog (id uuid primary key, is_active boolean not null default true);
      create table public.materials (id uuid primary key, sales_uom_id uuid not null references public.uom_catalog(id), is_active boolean not null default true);
      create table public.quotations (id uuid primary key, customer_id uuid not null references public.customers(id), active_revision_id uuid, status text not null default 'DRAFT');
      create table public.quotation_revisions (id uuid primary key, quotation_id uuid not null references public.quotations(id), status text not null, accepted_at timestamptz);
      alter table public.quotations add foreign key(active_revision_id) references public.quotation_revisions(id);
      create table public.sales_orders (id uuid primary key, customer_id uuid not null references public.customers(id));
      create table public.deliveries (id uuid primary key, customer_id uuid not null references public.customers(id), status text not null);
      create table public.delivery_actuals (id uuid primary key, delivery_id uuid not null references public.deliveries(id), actual_quantity numeric not null);
      create table public.receivables (id uuid primary key, customer_id uuid not null references public.customers(id), outstanding_amount numeric not null);
      create table public.payments (id uuid primary key);
      create function app_private.has_permission(text) returns boolean language sql stable as 'select true';
      insert into auth.users(id) values
        ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
      insert into public.user_profiles(user_id, display_name) values
        ('10000000-0000-4000-8000-000000000001', 'Khách A'), ('10000000-0000-4000-8000-000000000002', 'Khách B');
      insert into public.customers(id, name_vi) values
        ('20000000-0000-4000-8000-000000000001', 'Công ty A'), ('20000000-0000-4000-8000-000000000002', 'Công ty B');
      insert into public.customer_sites(id, customer_id) values
        ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
      insert into public.uom_catalog(id) values ('40000000-0000-4000-8000-000000000001');
      insert into public.materials(id, sales_uom_id) values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001');
    `);
    const directory = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(directory).find((item) => item.endsWith("_cp1_customer_portal.sql"));
    expect(name).toBeTruthy();
    await client.query(readFileSync(join(directory, name as string), "utf8"));
    await client.query(`
      insert into public.customer_portal_memberships(auth_user_id, customer_id) values
        ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'),
        ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002');
      insert into public.quotations(id, customer_id, active_revision_id, status) values
        ('70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', null, 'SENT'),
        ('70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', null, 'SENT');
      insert into public.quotation_revisions(id, quotation_id, status) values
        ('60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'SENT'),
        ('60000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'SENT');
      update public.quotations set active_revision_id = case id
        when '70000000-0000-4000-8000-000000000001'::uuid then '60000000-0000-4000-8000-000000000001'::uuid
        else '60000000-0000-4000-8000-000000000002'::uuid end;
      insert into public.deliveries(id, customer_id, status) values
        ('80000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'DELIVERED'),
        ('80000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'DELIVERED');
      insert into public.delivery_actuals(id, delivery_id, actual_quantity) values
        ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 60);
      insert into public.receivables(id, customer_id, outstanding_amount) values
        ('82000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 1000000);
    `);
    const accepted = await client.query(`select app_private.customer_portal_accept_quotation(
      '60000000-0000-4000-8000-000000000001', 'cp1-accept-portal-001', '10000000-0000-4000-8000-000000000001'
    ) as id`);
    const retry = await client.query(`select app_private.customer_portal_accept_quotation(
      '60000000-0000-4000-8000-000000000001', 'cp1-accept-portal-001', '10000000-0000-4000-8000-000000000001'
    ) as id`);
    expect(retry.rows[0].id).toBe(accepted.rows[0].id);
    await expect(client.query(`select app_private.customer_portal_accept_quotation(
      '60000000-0000-4000-8000-000000000002', 'cp1-forbidden-accept-001', '10000000-0000-4000-8000-000000000001'
    )`)).rejects.toMatchObject({ code: "42501" });
    const request = await client.query(`select app_private.customer_portal_request_quote(
      'NEW_QUOTE', '30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 5,
      '40000000-0000-4000-8000-000000000001', 'Cần giao trong tuần này', null, null,
      'cp1-request-portal-001', '10000000-0000-4000-8000-000000000001'
    ) as id`);
    expect(request.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const acknowledgement = await client.query(`select app_private.customer_portal_acknowledge_delivery(
      '80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
    ) as id`);
    expect(acknowledgement.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(client.query(`select app_private.customer_portal_acknowledge_delivery(
      '80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'
    )`)).rejects.toMatchObject({ code: "42501" });
    const issue = await client.query(`select app_private.customer_portal_report_delivery_issue(
      '80000000-0000-4000-8000-000000000001', 'SHORT_DELIVERY', 'Số lượng vật liệu nhận được cần được kiểm tra lại.',
      'cp1-issue-portal-001', '10000000-0000-4000-8000-000000000001'
    ) as id`);
    expect(issue.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    await client.query(`insert into storage.objects(bucket_id, name, owner_id) values (
      'customer-evidence', '10000000-0000-4000-8000-000000000001/payment-proof.pdf', '10000000-0000-4000-8000-000000000001'
    )`);
    const notice = await client.query(`select app_private.customer_portal_submit_payment_notice(
      1000000, current_date, 'BANK-REF-01', 'Đã chuyển khoản',
      '10000000-0000-4000-8000-000000000001/payment-proof.pdf', 'cp1-payment-portal-001', '10000000-0000-4000-8000-000000000001'
    ) as id`);
    expect(notice.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const invariants = await client.query(`select
      (select count(*) from public.sales_orders)::text as order_count,
      (select count(*) from public.receivables)::text as receivable_count,
      (select actual_quantity::text from public.delivery_actuals where id = '81000000-0000-4000-8000-000000000001') as actual_quantity,
      (select count(*) from public.payments)::text as payment_count`);
    expect(invariants.rows[0]).toMatchObject({ order_count: "0", receivable_count: "1", actual_quantity: "60", payment_count: "0" });
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop(); else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
