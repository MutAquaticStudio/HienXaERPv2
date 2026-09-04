import { readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import EmbeddedPostgres from "embedded-postgres";
import { expect, it } from "vitest";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không lấy được cổng PostgreSQL kiểm thử.");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

it("applies WP1 PortalIssue migration and only accepts assigned core sources", async () => {
  const port = await reservePort();
  const databaseDir = join(tmpdir(), `hienxa-wp1-migration-${process.pid}-${port}`);
  const database = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "hienxa-test-only",
    authMethod: "scram-sha-256",
    persistent: false,
    onLog: () => undefined,
    onError: () => undefined,
  });
  const client = database.getPgClient("postgres", "127.0.0.1");
  let started = false;
  try {
    await database.initialise();
    await database.start();
    started = true;
    await client.connect();
    await client.query(`
      create role anon noinherit;
      create role authenticated noinherit;
      create schema auth;
      create schema app_private;
      create function auth.uid() returns uuid language sql stable as 'select null::uuid';
      create table public.user_profiles (
        user_id uuid primary key, display_name text not null, status text not null default 'ACTIVE'
      );
      create table public.work_items (
        id uuid primary key, claimed_by uuid references public.user_profiles(user_id), status text not null
      );
      create table public.delivery_assignments (
        id uuid primary key default gen_random_uuid(), delivery_id uuid not null,
        driver_user_id uuid not null references public.user_profiles(user_id), status text not null
      );
      create table public.service_job_assignments (
        id uuid primary key default gen_random_uuid(), service_job_id uuid not null,
        operator_user_id uuid not null references public.user_profiles(user_id), status text not null
      );
      create function app_private.assert_actor_permission(uuid, text)
      returns void language sql stable as 'select';
      create function app_private.is_active_user(uuid)
      returns boolean language sql stable as 'select true';
      create function app_private.has_permission(text)
      returns boolean language sql stable as 'select true';
      insert into public.user_profiles(user_id, display_name) values
        ('10000000-0000-4000-8000-000000000001', 'Tài xế thử'),
        ('10000000-0000-4000-8000-000000000002', 'Người khác');
      insert into public.work_items(id, claimed_by, status) values
        ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'IN_PROGRESS'),
        ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'IN_PROGRESS');
      insert into public.delivery_assignments(delivery_id, driver_user_id, status) values
        ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ASSIGNED');
      insert into public.service_job_assignments(service_job_id, operator_user_id, status) values
        ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'ACTIVE');
    `);
    const directory = join(process.cwd(), "supabase/migrations");
    const name = readdirSync(directory).find((item) => item.endsWith("_wp1_worker_portal_support.sql"));
    expect(name).toBeTruthy();
    await client.query(readFileSync(join(directory, name as string), "utf8"));

    const workIssue = await client.query(`
      select app_private.report_portal_issue(
        'WORK_ITEM', '20000000-0000-4000-8000-000000000001', 'WRONG_ADDRESS',
        'Điểm nhận mới không trùng với lộ trình được giao.', 'portal-issue-work-001',
        '10000000-0000-4000-8000-000000000001'
      ) as id
    `);
    const retry = await client.query(`
      select app_private.report_portal_issue(
        'WORK_ITEM', '20000000-0000-4000-8000-000000000001', 'WRONG_ADDRESS',
        'Điểm nhận mới không trùng với lộ trình được giao.', 'portal-issue-work-001',
        '10000000-0000-4000-8000-000000000001'
      ) as id
    `);
    expect(retry.rows[0].id).toBe(workIssue.rows[0].id);

    const deliveryIssue = await client.query(`
      select app_private.report_portal_issue(
        'DELIVERY', '30000000-0000-4000-8000-000000000001', 'INSUFFICIENT_GOODS',
        'Số lượng vật liệu tại điểm lấy thiếu so với phiếu giao.', 'portal-issue-delivery-001',
        '10000000-0000-4000-8000-000000000001'
      ) as id
    `);
    expect(deliveryIssue.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);

    await expect(client.query(`
      select app_private.report_portal_issue(
        'WORK_ITEM', '20000000-0000-4000-8000-000000000002', 'OTHER',
        'Cố ghi nhận sự cố vào công việc của người khác.', 'portal-issue-forbidden-001',
        '10000000-0000-4000-8000-000000000001'
      )
    `)).rejects.toMatchObject({ code: "42501" });
    const counts = await client.query("select count(*)::text as count from public.portal_issues");
    expect(counts.rows[0].count).toBe("2");
  } finally {
    await client.end().catch(() => undefined);
    if (started) await database.stop();
    else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
