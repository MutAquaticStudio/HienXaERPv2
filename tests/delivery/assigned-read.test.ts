import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAssignedDeliverySnapshotFromSupabase } from "@/modules/delivery/postgres-repository";
import type { Principal } from "@/modules/platform/types";

function query(data: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return builder;
}

describe("P10 assigned delivery read", () => {
  it("maps only the signed-in worker assignment through Supabase reads", async () => {
    const rows: Record<string, unknown[]> = {
      delivery_assignments: [
        {
          delivery_id: "delivery-1",
          vehicle_id: "vehicle-1",
          driver_user_id: "driver-1",
        },
      ],
      deliveries: [
        {
          id: "delivery-1",
          delivery_number: "DLV-2026-000001",
          sales_order_id: "order-1",
          customer_name_snapshot: "Công ty An Phát",
          sourcing_mode: "WAREHOUSE",
          pickup_address_snapshot: "Kho Hà Đông",
          drop_address_snapshot: "Công trường An Phát",
          scheduled_date: "2026-09-04",
          status: "ASSIGNED",
        },
      ],
      delivery_lines: [
        {
          id: "line-1",
          delivery_id: "delivery-1",
          material_name_snapshot: "Xi măng PCB40",
          material_code_snapshot: "XM-PCB40",
          planned_quantity: "20",
          uom_symbol_snapshot: "BAO",
        },
      ],
      delivery_actuals: [
        {
          delivery_line_id: "line-1",
          actual_quantity: "20",
          accepted_quantity: "19",
        },
      ],
      delivery_proofs: [
        { delivery_id: "delivery-1" },
        { delivery_id: "delivery-1" },
      ],
      evidence: [{ id: "evidence-1", storage_path: "driver-1/proof.jpg" }],
      sales_orders: [{ id: "order-1", sales_order_number: "SO-2026-000001" }],
      vehicles: [{ id: "vehicle-1", code: "XE-01", plate_number: "29C-12345" }],
      user_profiles: [{ user_id: "driver-1", display_name: "Nguyễn Văn Lái" }],
    };
    const from = vi.fn((table: string) => query(rows[table] ?? []));
    const principal: Principal = {
      userId: "driver-1",
      displayName: "Nguyễn Văn Lái",
      status: "ACTIVE",
      roles: ["DRIVER"],
      permissions: [
        "platform.access_worker",
        "work_item.read_assigned",
        "delivery.update_assigned",
      ],
      scopes: [{ kind: "SELF" }],
    };

    const snapshot = await readAssignedDeliverySnapshotFromSupabase(
      { from } as never,
      principal,
    );

    expect(snapshot.deliveries).toEqual([
      expect.objectContaining({
        id: "delivery-1",
        salesOrderNumber: "SO-2026-000001",
        vehicleName: "XE-01 · 29C-12345",
        driverUserId: "driver-1",
        proofCount: 2,
        lines: [
          expect.objectContaining({
            id: "line-1",
            actualQuantity: "20",
            acceptedQuantity: "19",
          }),
        ],
      }),
    ]);
    expect(snapshot.planningOptions).toEqual([]);
    expect(snapshot.evidence).toEqual([
      { id: "evidence-1", label: "driver-1/proof.jpg" },
    ]);
    expect(from).toHaveBeenCalledWith("delivery_assignments");
  });
});
