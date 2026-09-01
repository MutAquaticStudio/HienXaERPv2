import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) =>
    item.endsWith("_p6_inventory_yard_control.sql"),
  );
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

describe("P6 inventory repository contract", () => {
  it("uses an immutable movement ledger and a private projection", () => {
    const sql = migration();
    expect(sql).toContain("create table public.inventory_movements");
    expect(sql).toContain("create table app_private.inventory_positions");
    expect(sql).toContain("inventory_movements_no_update_or_delete");
    expect(sql).toContain("create view public.inventory_stock_status");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*inventory_positions/i,
    );
  });

  it("serializes reservations and derives base quantity from a versioned conversion", () => {
    const sql = migration();
    const reserveStart = sql.indexOf(
      "create or replace function app_private.reserve_stock",
    );
    const reserveEnd = sql.indexOf(
      "create or replace function app_private.release_stock_reservation",
      reserveStart,
    );
    const reserveSql = sql.slice(reserveStart, reserveEnd);
    const allocationLock = reserveSql.indexOf("for update of source");
    const positionRead = reserveSql.indexOf(
      "from app_private.inventory_positions",
    );
    const positionLock = reserveSql.indexOf("for update;", positionRead);
    const availabilityCheck = reserveSql.indexOf(
      "position.on_hand_quantity - position.reserved_quantity < base_quantity",
    );
    const reservationUpdate = reserveSql.indexOf(
      "update app_private.inventory_positions set",
    );

    expect(reserveStart).toBeGreaterThanOrEqual(0);
    expect(reserveEnd).toBeGreaterThan(reserveStart);
    expect(allocationLock).toBeGreaterThanOrEqual(0);
    expect(positionRead).toBeGreaterThan(allocationLock);
    expect(positionLock).toBeGreaterThan(positionRead);
    expect(availabilityCheck).toBeGreaterThan(positionLock);
    expect(reservationUpdate).toBeGreaterThan(availabilityCheck);
    expect(sql).toContain("RESERVATION_BASE_UOM_CONVERSION_NOT_FOUND");
    expect(sql).toContain("conversion_snapshot jsonb not null");
  });

  it("posts every receipt, issue and approved count variance to the ledger", () => {
    const sql = migration();
    expect(sql).toContain("confirm_warehouse_receipt");
    expect(sql).toContain("confirm_warehouse_issue");
    expect(sql).toContain("capture_stock_count");
    expect(sql).toContain("approve_stock_adjustment");
    expect(
      sql.match(/app_private\.post_inventory_movement\(/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("DROPSHIP_PURCHASE_ORDER_CANNOT_ENTER_WAREHOUSE");
    expect(sql).toContain("STOCK_COUNT_STALE_RECOUNT_REQUIRED");
  });

  it("keeps browser writes closed and private write functions uncallable", () => {
    const sql = migration();
    expect(sql).toContain(
      "grant select on public.inventory_movements to authenticated",
    );
    expect(sql).toContain(
      "revoke all on function app_private.reserve_stock(uuid, uuid)",
    );
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|all).*public\.inventory_movements\s+to authenticated/i,
    );
  });
});
