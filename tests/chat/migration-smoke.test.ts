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

it("persists a retry-safe chat message only for authorized participants and enforces closure", async () => {
  const port = await reservePort();
  const databaseDir = join(tmpdir(), `hienxa-chat1-migration-${process.pid}-${port}`);
  const database = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "hienxa-test-only", authMethod: "scram-sha-256", persistent: false, onLog: () => undefined, onError: () => undefined });
  const client = database.getPgClient("postgres", "127.0.0.1");
  let started = false;
  const staff = "10000000-0000-4000-8000-000000000001";
  const worker = "10000000-0000-4000-8000-000000000002";
  const customer = "10000000-0000-4000-8000-000000000003";
  const otherCustomer = "10000000-0000-4000-8000-000000000004";
  const customerId = "20000000-0000-4000-8000-000000000001";
  const otherCustomerId = "20000000-0000-4000-8000-000000000002";
  const deliveryId = "30000000-0000-4000-8000-000000000001";
  const otherDeliveryId = "30000000-0000-4000-8000-000000000002";
  try {
    await database.initialise(); await database.start(); started = true; await client.connect();
    await client.query(`
      create extension if not exists pgcrypto;
      create role anon noinherit; create role authenticated noinherit;
      create schema auth; create schema app_private; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table storage.objects(bucket_id text not null, name text not null);
      create table public.customers(id uuid primary key, name_vi text not null, is_active boolean not null default true);
      create table public.user_profiles(user_id uuid primary key references auth.users(id), display_name text not null, status text not null);
      create table public.roles(id uuid primary key, code text not null unique);
      create table public.permissions(id uuid primary key default gen_random_uuid(), code text not null unique, description_vi text not null);
      create table public.user_roles(user_id uuid references public.user_profiles(user_id), role_id uuid references public.roles(id), primary key(user_id, role_id));
      create table public.role_permissions(role_id uuid references public.roles(id), permission_id uuid references public.permissions(id), primary key(role_id, permission_id));
      create table public.customer_portal_memberships(auth_user_id uuid primary key references auth.users(id), customer_id uuid references public.customers(id), active boolean not null);
      create table public.evidence(id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.user_profiles(user_id), bucket_id text not null, storage_path text not null);
      create table public.deliveries(id uuid primary key, delivery_number text not null, customer_id uuid references public.customers(id), created_by uuid references public.user_profiles(user_id), status text not null);
      create table public.delivery_assignments(id uuid primary key default gen_random_uuid(), delivery_id uuid references public.deliveries(id), driver_user_id uuid references public.user_profiles(user_id), assigned_by uuid references public.user_profiles(user_id), status text not null, assigned_at timestamptz not null default now());
      create table public.sales_orders(id uuid primary key, sales_order_number text not null, customer_id uuid references public.customers(id), created_by uuid references public.user_profiles(user_id), confirmed_by uuid references public.user_profiles(user_id));
      create table public.service_jobs(id uuid primary key, job_number text not null, customer_id uuid references public.customers(id), created_by uuid references public.user_profiles(user_id));
      create table public.service_job_assignments(id uuid primary key default gen_random_uuid(), service_job_id uuid references public.service_jobs(id), operator_user_id uuid references public.user_profiles(user_id), assigned_by uuid references public.user_profiles(user_id), status text not null, assigned_at timestamptz not null default now());
      create table public.portal_issues(id uuid primary key, issue_number text not null, reported_by uuid references public.user_profiles(user_id));
      create function app_private.is_active_user(check_user_id uuid) returns boolean language sql stable as $$ select exists(select 1 from public.user_profiles where user_id = check_user_id and status = 'ACTIVE') $$;
      create function app_private.actor_has_permission(actor_id uuid, permission_code text) returns boolean language sql stable as $$
        select exists(select 1 from public.user_profiles profile join public.user_roles user_role on user_role.user_id = profile.user_id join public.role_permissions role_permission on role_permission.role_id = user_role.role_id join public.permissions permission on permission.id = role_permission.permission_id where profile.user_id = actor_id and profile.status = 'ACTIVE' and permission.code = permission_code)
      $$;
      create function app_private.assert_actor_permission(actor_id uuid, permission_code text) returns void language plpgsql as $$ begin if not app_private.actor_has_permission(actor_id, permission_code) then raise exception 'denied' using errcode = '42501'; end if; end $$;
      insert into auth.users(id) values ('${staff}'), ('${worker}'), ('${customer}'), ('${otherCustomer}');
      insert into public.user_profiles(user_id, display_name, status) values ('${staff}', 'Điều phối thử', 'ACTIVE'), ('${worker}', 'Tài xế thử', 'ACTIVE');
      insert into public.roles(id, code) values ('40000000-0000-4000-8000-000000000001', 'OWNER_ADMIN'), ('40000000-0000-4000-8000-000000000002', 'DRIVER');
      insert into public.user_roles(user_id, role_id) values ('${staff}', '40000000-0000-4000-8000-000000000001'), ('${worker}', '40000000-0000-4000-8000-000000000002');
      insert into public.permissions(code, description_vi) values ('delivery.read', 'Xem chuyến giao');
      insert into public.role_permissions(role_id, permission_id) select '40000000-0000-4000-8000-000000000001', id from public.permissions where code = 'delivery.read';
      insert into public.customers(id, name_vi) values ('${customerId}', 'Khách A'), ('${otherCustomerId}', 'Khách B');
      insert into public.customer_portal_memberships(auth_user_id, customer_id, active) values ('${customer}', '${customerId}', true), ('${otherCustomer}', '${otherCustomerId}', true);
      insert into public.deliveries(id, delivery_number, customer_id, created_by, status) values ('${deliveryId}', 'DLV-CHAT-001', '${customerId}', '${staff}', 'DISPATCHED'), ('${otherDeliveryId}', 'DLV-CHAT-002', '${otherCustomerId}', '${staff}', 'DISPATCHED');
      insert into public.delivery_assignments(delivery_id, driver_user_id, assigned_by, status) values ('${deliveryId}', '${worker}', '${staff}', 'ACCEPTED');
    `);
    const directory = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(directory).find((item) => item.endsWith("_chat1_operational_chat.sql"));
    expect(name).toBeTruthy();
    await client.query(readFileSync(join(directory, name as string), "utf8"));

    const conversation = await client.query(`select app_private.ensure_operational_conversation('DELIVERY', '${deliveryId}', '${worker}') as id`);
    const conversationId = conversation.rows[0].id as string;
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await client.query(`select count(*)::int as count from public.conversation_participants where conversation_id = '${conversationId}'`)).rows[0].count).toBe(2);
    const first = await client.query(`select app_private.send_operational_message('${conversationId}', 'Đã đến điểm giao, xin hướng dẫn tiếp theo.', null, 'chat-retry-safe-key-2026', '${worker}') as id`);
    const retry = await client.query(`select app_private.send_operational_message('${conversationId}', 'Đã đến điểm giao, xin hướng dẫn tiếp theo.', null, 'chat-retry-safe-key-2026', '${worker}') as id`);
    expect(retry.rows[0].id).toBe(first.rows[0].id);
    const afterSend = await client.query(`select (select count(*)::int from public.conversation_messages where conversation_id = '${conversationId}') as message_count, (select status from public.deliveries where id = '${deliveryId}') as delivery_status`);
    expect(afterSend.rows[0]).toMatchObject({ message_count: 1, delivery_status: "DISPATCHED" });
    await expect(client.query(`select app_private.ensure_operational_conversation('DELIVERY', '${deliveryId}', '${otherCustomer}')`)).rejects.toMatchObject({ code: "42501" });
    await client.query(`set request.jwt.claim.sub = '${worker}'`);
    await client.query("set role authenticated");
    expect((await client.query(`select count(*)::int as count from public.conversation_messages where conversation_id = '${conversationId}'`)).rows[0].count).toBe(1);
    await client.query("reset role");
    await client.query(`update public.delivery_assignments set status = 'COMPLETED' where delivery_id = '${deliveryId}'`);
    await client.query("set role authenticated");
    expect((await client.query(`select count(*)::int as count from public.conversation_messages where conversation_id = '${conversationId}'`)).rows[0].count).toBe(0);
    await client.query("reset role");
    await client.query(`select app_private.close_operational_conversation('${conversationId}', 'Điều phối đã xác nhận kết thúc trao đổi.', '${staff}')`);
    await expect(client.query(`select app_private.send_operational_message('${conversationId}', 'Tin nhắn không được phép sau khi đóng.', null, 'chat-closed-key-2026', '${worker}')`)).rejects.toMatchObject({ code: "23514" });
    await client.query("set role authenticated");
    await expect(client.query(`insert into public.conversation_messages(conversation_id, sender_user_id, sender_kind, sender_display_name_snapshot, body, client_idempotency_key) values ('${conversationId}', '${worker}', 'EMPLOYEE', 'Tài xế thử', 'Ghi trực tiếp', 'browser-direct-write-2026')`)).rejects.toMatchObject({ code: "42501" });
    await client.query("reset role");
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop();
    await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
