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
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("serializes competing reservations without oversubscribing inventory", async () => {
  const port = await reservePort();
  const databaseDir = join(
    tmpdir(),
    `hienxa-p6-concurrency-${process.pid}-${port}`,
  );
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
        create schema concurrency_harness;
        create table concurrency_harness.inventory_positions (
          id integer primary key,
          on_hand_quantity numeric(20, 6) not null,
          reserved_quantity numeric(20, 6) not null default 0,
          check (reserved_quantity <= on_hand_quantity)
        );
        create table concurrency_harness.stock_reservations (
          request_id text primary key,
          position_id integer not null references concurrency_harness.inventory_positions(id),
          reserved_quantity numeric(20, 6) not null check (reserved_quantity > 0)
        );
        insert into concurrency_harness.inventory_positions (
          id, on_hand_quantity, reserved_quantity
        ) values (1, 100, 0);

        create function concurrency_harness.reserve_stock(
          p_request_id text,
          p_quantity numeric
        ) returns numeric
        language plpgsql
        security invoker
        set search_path = ''
        as $$
        declare
          position concurrency_harness.inventory_positions%rowtype;
        begin
          select * into position
          from concurrency_harness.inventory_positions
          where id = 1
          for update;

          if position.on_hand_quantity - position.reserved_quantity < p_quantity then
            raise exception 'INSUFFICIENT_AVAILABLE_INVENTORY'
              using errcode = '23514';
          end if;

          update concurrency_harness.inventory_positions
          set reserved_quantity = reserved_quantity + p_quantity
          where id = 1;

          insert into concurrency_harness.stock_reservations (
            request_id, position_id, reserved_quantity
          ) values (p_request_id, 1, p_quantity);

          return position.on_hand_quantity - position.reserved_quantity - p_quantity;
        end;
        $$;
      `);

    const pidA = Number(
      (await sessionA.query("select pg_backend_pid() as pid")).rows[0].pid,
    );
    const pidB = Number(
      (await sessionB.query("select pg_backend_pid() as pid")).rows[0].pid,
    );
    expect(pidA).not.toBe(pidB);

    const releaseA = deferred();
    const aReserved = deferred();
    const reservationA = (async () => {
      await sessionA.query("begin");
      try {
        const result = await sessionA.query(
          "select concurrency_harness.reserve_stock($1, $2) as available_quantity",
          ["reservation-a", 60],
        );
        aReserved.resolve();
        await releaseA.promise;
        await sessionA.query("commit");
        return Number(result.rows[0].available_quantity);
      } catch (error) {
        await sessionA.query("rollback");
        throw error;
      }
    })();

    await aReserved.promise;
    const reservationB = (async () => {
      await sessionB.query("begin");
      try {
        const result = await sessionB.query(
          "select concurrency_harness.reserve_stock($1, $2) as available_quantity",
          ["reservation-b", 60],
        );
        await sessionB.query("commit");
        return Number(result.rows[0].available_quantity);
      } catch (error) {
        await sessionB.query("rollback");
        throw error;
      }
    })();

    let waitEventType: string | null = null;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await observer.query(
        `select wait_event_type
           from pg_stat_activity
           where pid = $1`,
        [pidB],
      );
      waitEventType = result.rows[0]?.wait_event_type ?? null;
      if (waitEventType === "Lock") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(waitEventType).toBe("Lock");

    releaseA.resolve();
    await expect(reservationA).resolves.toBe(40);
    await expect(reservationB).rejects.toMatchObject({ code: "23514" });

    const finalState = await observer.query(`
        select position.on_hand_quantity, position.reserved_quantity,
          position.on_hand_quantity - position.reserved_quantity as available_quantity,
          (select count(*) from concurrency_harness.stock_reservations) as reservation_count
        from concurrency_harness.inventory_positions as position
        where position.id = 1
      `);
    expect(Number(finalState.rows[0].on_hand_quantity)).toBe(100);
    expect(Number(finalState.rows[0].reserved_quantity)).toBe(60);
    expect(Number(finalState.rows[0].available_quantity)).toBe(40);
    expect(Number(finalState.rows[0].reservation_count)).toBe(1);
  } finally {
    await Promise.allSettled(clients.map((client) => client.end()));
    if (started) await database.stop();
    else await rm(databaseDir, { recursive: true, force: true });
  }
}, 60_000);
