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
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Không lấy được cổng PostgreSQL kiểm thử.");
  }
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it("lets exactly one backend claim a work item and keeps double-tap idempotent", async () => {
  const port = await reservePort();
  const databaseDir = join(tmpdir(), `hienxa-p10-concurrency-${process.pid}-${port}`);
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
  let started = false;
  const clients = [
    database.getPgClient("postgres", "127.0.0.1"),
    database.getPgClient("postgres", "127.0.0.1"),
    database.getPgClient("postgres", "127.0.0.1"),
  ];
  const [sessionA, sessionB, observer] = clients;
  try {
    await database.initialise();
    await database.start();
    started = true;
    await Promise.all(clients.map((client) => client.connect()));
    await observer.query(`
      create schema work_harness;
      create table work_harness.work_items (
        id integer primary key,
        status text not null check (status in ('AVAILABLE', 'CLAIMED')),
        claimed_by integer,
        check ((status = 'AVAILABLE' and claimed_by is null) or (status = 'CLAIMED' and claimed_by is not null))
      );
      create table work_harness.work_claims (
        id bigserial primary key,
        work_item_id integer not null references work_harness.work_items(id),
        worker_id integer not null,
        idempotency_key text not null,
        status text not null default 'ACTIVE',
        unique (work_item_id, worker_id, idempotency_key)
      );
      create unique index one_active_claim on work_harness.work_claims(work_item_id) where status = 'ACTIVE';
      insert into work_harness.work_items values (1, 'AVAILABLE', null);
      create function work_harness.claim_work_item(
        p_work_item_id integer, p_worker_id integer, p_idempotency_key text
      ) returns integer language plpgsql set search_path = '' as $$
      declare item work_harness.work_items%rowtype;
      begin
        select * into item from work_harness.work_items
        where id = p_work_item_id for update;
        if item.status = 'CLAIMED' and item.claimed_by = p_worker_id then
          return item.id;
        end if;
        if item.status <> 'AVAILABLE' or item.claimed_by is not null then
          raise exception 'WORK_ALREADY_CLAIMED' using errcode = '23505';
        end if;
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_worker_id::text, 0));
        update work_harness.work_items set status = 'CLAIMED', claimed_by = p_worker_id
        where id = p_work_item_id and status = 'AVAILABLE' and claimed_by is null;
        insert into work_harness.work_claims(work_item_id, worker_id, idempotency_key)
        values (p_work_item_id, p_worker_id, p_idempotency_key);
        return p_work_item_id;
      end; $$;
    `);

    const pidA = Number((await sessionA.query("select pg_backend_pid() as pid")).rows[0].pid);
    const pidB = Number((await sessionB.query("select pg_backend_pid() as pid")).rows[0].pid);
    expect(pidA).not.toBe(pidB);

    const releaseA = deferred();
    const aClaimed = deferred();
    const claimA = (async () => {
      await sessionA.query("begin");
      try {
        const result = await sessionA.query("select work_harness.claim_work_item($1, $2, $3) as id", [1, 101, "tap-worker-a"]);
        aClaimed.resolve();
        await releaseA.promise;
        await sessionA.query("commit");
        return Number(result.rows[0].id);
      } catch (error) {
        await sessionA.query("rollback");
        throw error;
      }
    })();
    await aClaimed.promise;
    const claimB = (async () => {
      await sessionB.query("begin");
      try {
        const result = await sessionB.query("select work_harness.claim_work_item($1, $2, $3) as id", [1, 202, "tap-worker-b"]);
        await sessionB.query("commit");
        return Number(result.rows[0].id);
      } catch (error) {
        await sessionB.query("rollback");
        throw error;
      }
    })();

    let waitEventType: string | null = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await observer.query("select wait_event_type from pg_stat_activity where pid = $1", [pidB]);
      waitEventType = result.rows[0]?.wait_event_type ?? null;
      if (waitEventType === "Lock") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waitEventType).toBe("Lock");
    releaseA.resolve();
    await expect(claimA).resolves.toBe(1);
    await expect(claimB).rejects.toMatchObject({ code: "23505" });

    const retry = await observer.query("select work_harness.claim_work_item($1, $2, $3) as id", [1, 101, "tap-worker-a-again"]);
    expect(Number(retry.rows[0].id)).toBe(1);
    const state = await observer.query(`
      select item.status, item.claimed_by,
        (select count(*) from work_harness.work_claims where status = 'ACTIVE') as active_claims
      from work_harness.work_items item where item.id = 1
    `);
    expect(state.rows[0]).toMatchObject({ status: "CLAIMED", claimed_by: 101 });
    expect(Number(state.rows[0].active_claims)).toBe(1);
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
    if (started) await database.stop();
    else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
