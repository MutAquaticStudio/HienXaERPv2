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

it("accepts GPS only for one active assigned driver, throttles telemetry, and leaves Delivery unchanged", async () => {
  const port = await reservePort();
  const databaseDir = join(tmpdir(), `hienxa-gps1-migration-${process.pid}-${port}`);
  const database = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "hienxa-test-only", authMethod: "scram-sha-256", persistent: false, onLog: () => undefined, onError: () => undefined });
  const client = database.getPgClient("postgres", "127.0.0.1");
  let started = false;
  try {
    await database.initialise(); await database.start(); started = true; await client.connect();
    await client.query(`
      create extension if not exists pgcrypto;
      create role anon noinherit; create role authenticated noinherit;
      create schema auth; create schema app_private;
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      create table public.roles (id uuid primary key, code text not null unique);
      create table public.permissions (id uuid primary key default gen_random_uuid(), code text not null unique, description_vi text not null);
      create table public.user_profiles (user_id uuid primary key, display_name text not null);
      create table public.role_permissions (role_id uuid references public.roles(id), permission_id uuid references public.permissions(id), primary key(role_id, permission_id));
      create table public.vehicles (id uuid primary key, code text not null, plate_number text not null);
      create table public.deliveries (id uuid primary key, delivery_number text not null, drop_address_snapshot text not null, status text not null, dispatched_at timestamptz, updated_at timestamptz not null default now());
      create table public.delivery_assignments (id uuid primary key default gen_random_uuid(), delivery_id uuid not null references public.deliveries(id), vehicle_id uuid not null references public.vehicles(id), driver_user_id uuid not null references public.user_profiles(user_id), status text not null);
      create function app_private.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
      create function app_private.assert_actor_permission(uuid, text) returns void language sql stable as 'select';
      create function app_private.has_permission(text) returns boolean language sql stable as 'select true';
      insert into public.roles(id, code) values
        ('00000000-0000-4000-8000-000000000001', 'OWNER_ADMIN'),
        ('00000000-0000-4000-8000-000000000002', 'SUPERVISOR'),
        ('00000000-0000-4000-8000-000000000003', 'DISPATCHER'),
        ('00000000-0000-4000-8000-000000000004', 'DRIVER');
      insert into public.user_profiles(user_id, display_name) values
        ('10000000-0000-4000-8000-000000000001', 'Tài xế thử'),
        ('10000000-0000-4000-8000-000000000002', 'Người khác');
      insert into public.vehicles(id, code, plate_number) values ('30000000-0000-4000-8000-000000000001', 'XE-TEST', '99C-000.01');
      insert into public.deliveries(id, delivery_number, drop_address_snapshot, status, dispatched_at) values
        ('40000000-0000-4000-8000-000000000001', 'DLV-TEST-001', 'Điểm giao thử', 'DISPATCHED', now());
      insert into public.delivery_assignments(delivery_id, vehicle_id, driver_user_id, status) values
        ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ACCEPTED');
    `);
    const directory = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(directory).find((item) => item.endsWith("_gps1_active_delivery_gps.sql"));
    expect(name).toBeTruthy();
    await client.query(readFileSync(join(directory, name as string), "utf8"));

    const inserted = await client.query(`select app_private.record_active_delivery_location(
      21.1714382, 106.0697221, 18, 4.2, 270, now(), '10000000-0000-4000-8000-000000000001'
    ) as id`);
    expect(inserted.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const afterFirstPing = await client.query(`select
      (select status from public.deliveries where id = '40000000-0000-4000-8000-000000000001') as delivery_status,
      (select count(*)::text from public.vehicle_location_pings) as ping_count,
      (select freshness_status from public.active_vehicle_location_view) as freshness_status`);
    expect(afterFirstPing.rows[0]).toMatchObject({ delivery_status: "DISPATCHED", ping_count: "1", freshness_status: "LIVE" });

    await expect(client.query(`select app_private.record_active_delivery_location(
      21.1714382, 106.0697221, 18, null, null, now() + interval '5 seconds', '10000000-0000-4000-8000-000000000001'
    )`)).rejects.toMatchObject({ code: "23514" });
    await expect(client.query(`select app_private.record_active_delivery_location(
      21.1714382, 106.0697221, 18, null, null, now() + interval '20 seconds', '10000000-0000-4000-8000-000000000002'
    )`)).rejects.toMatchObject({ code: "23514" });

    await client.query("set role authenticated");
    await expect(client.query(`insert into public.current_vehicle_locations(
      vehicle_id, worker_user_id, delivery_id, latitude, longitude, accuracy_m, recorded_at
    ) values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 1, 1, 1, now())`)).rejects.toMatchObject({ code: "42501" });
    await client.query("reset role");

    await client.query(`
      insert into public.vehicle_location_pings(vehicle_id, worker_user_id, delivery_id, latitude, longitude, accuracy_m, recorded_at, received_at)
      values
        ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 1, 1, 1, now() - interval '40 days', now() - interval '40 days'),
        ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 2, 2, 1, now() - interval '41 days', now() - interval '41 days');
      insert into public.vehicle_location_retention_holds(vehicle_id, reason, created_by)
      values ('30000000-0000-4000-8000-000000000001', 'Giữ lại để kiểm tra tranh chấp giao hàng.', '10000000-0000-4000-8000-000000000001');
    `);
    expect((await client.query(`select app_private.purge_vehicle_location_pings(now() - interval '30 days', '10000000-0000-4000-8000-000000000001') as deleted_count`)).rows[0].deleted_count).toBe(0);
    await client.query("update public.deliveries set status = 'CONFIRMED' where id = '40000000-0000-4000-8000-000000000001'");
    await expect(client.query(`select app_private.record_active_delivery_location(
      21.1714382, 106.0697221, 18, null, null, now() + interval '30 seconds', '10000000-0000-4000-8000-000000000001'
    )`)).rejects.toMatchObject({ code: "23514" });
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop();
    await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
