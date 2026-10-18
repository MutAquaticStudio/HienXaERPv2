// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), permission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ rpc: m.rpc }) }));

import { saveOperationSettingsAction } from "./operation-actions";

const op = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.clearAllMocks(); m.permission.mockResolvedValue({ branchId: "b1" }); m.rpc.mockResolvedValue({ data: 2, error: null }); });

it("saves the stop time of the current branch with the owner's permission", async () => {
  expect(await saveOperationSettingsAction({ operationId: op, expectedVersion: 1, stopMinutes: 45 })).toMatchObject({ status: "SUCCESS", version: 2 });
  expect(m.permission).toHaveBeenCalledWith("roles.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_branch_operation_settings", { target_branch_id: "b1", settings: { stop_minutes: "45" }, expected_version: 1, operation_id: op });
});

it("refuses out-of-range minutes before the database and explains a concurrent edit", async () => {
  expect((await saveOperationSettingsAction({ operationId: op, expectedVersion: null, stopMinutes: 4 })).status).toBe("FAILED");
  expect(m.rpc).not.toHaveBeenCalled();
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PT409", message: "operation_settings_changed" } });
  expect(await saveOperationSettingsAction({ operationId: op, expectedVersion: 1, stopMinutes: 45 })).toMatchObject({ status: "FAILED", message: expect.stringContaining("sửa ở nơi khác") });
  m.rpc.mockRejectedValueOnce(new Error("fetch failed"));
  expect((await saveOperationSettingsAction({ operationId: op, expectedVersion: 1, stopMinutes: 45 })).status).toBe("UNKNOWN");
});
