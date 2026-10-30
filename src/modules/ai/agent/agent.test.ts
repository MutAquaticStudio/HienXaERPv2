// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A minimal Supabase stand-in: every query on a table resolves to the rows given for it; rpc answers per function.
const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, rpc: vi.fn() }));
function query(table: string) {
  const result = () => ({ data: state.tables[table] ?? [], error: null });
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "eq", "ilike", "in", "gt", "order", "limit", "neq", "is", "not", "lte", "or"]) builder[name] = () => builder;
  builder.maybeSingle = async () => ({ data: (state.tables[table] ?? [])[0] ?? null, error: null });
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
  return builder;
}
const supabase = { from: (table: string) => query(table), rpc: (...args: unknown[]) => state.rpc(...args) };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => supabase }));
const access = vi.hoisted(() => ({ permissions: ["ai.use", "finance.expense.manage"] }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b1", permissions: access.permissions }) }));

import { AGENT_TOOLS } from "./tools";
import { confirmAiActionAction, dismissAiActionAction } from "./actions";
import { AGENT_ACTIONS } from "./registry";
import { findCustomer } from "./resolve";

const context = (permissions: string[]) => ({ supabase: supabase as never, branchId: "b1", permissions: new Set(permissions) });
const expenseTool = AGENT_TOOLS.find((tool) => tool.name === "soan_chi_phi")!;
const expenseInput = { loai_chi: "Điện nước", so_tien: "1.250.000", nguoi_nhan: "EVN", quy: "", ghi_chu: "" };

describe("assistant actions (D37)", () => {
  beforeEach(() => {
    state.tables = {};
    state.rpc.mockReset();
    access.permissions = ["ai.use", "finance.expense.manage"];
  });

  it("offers each action only to people with its permissions, as a strict tool", () => {
    expect(AGENT_ACTIONS).toHaveLength(12);
    expect(expenseTool.define(context(["ai.use"]))).toBeNull();
    const definition = expenseTool.define(context(["ai.use", "finance.expense.manage"]));
    expect(definition).toMatchObject({ name: "soan_chi_phi", strict: true });
    const schema = definition!.input_schema as { required: string[]; properties: object };
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
  });

  it("only prepares: stores the action with its summary and writes nothing else", async () => {
    state.tables.finance_accounts = [{ id: "acc", code: "TM", name: "Tiền mặt" }];
    state.rpc.mockResolvedValue({ data: "act-1", error: null });
    const result = await expenseTool.run(context(["ai.use", "finance.expense.manage"]), expenseInput);
    expect(result).toMatchObject({ isError: false, actionId: "act-1" });
    expect(result.text).toContain("Xác nhận");
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("create_ai_action", expect.objectContaining({
      target_branch_id: "b1", action_kind: "soan_chi_phi", action_payload: expect.objectContaining({ so_tien: "1250000", accountId: "acc" }),
    }));
  });

  it("tells the model what is wrong instead of preparing", async () => {
    const result = await expenseTool.run(context(["ai.use", "finance.expense.manage"]), { ...expenseInput, so_tien: "-5" });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/^Lỗi: thông tin chưa hợp lệ/);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("runs the normal command with the action id as operation id when confirmed, then marks it done", async () => {
    state.tables.ai_actions = [{ id: "11111111-1111-4111-8111-111111111111", title: "Ghi chi", summary: [], state: "PENDING", result_link: null, result_message: null, kind: "soan_chi_phi",
      payload: { loai_chi: "Điện nước", so_tien: "1250000", nguoi_nhan: "EVN", ghi_chu: "", accountId: "acc" } }];
    state.rpc.mockResolvedValue({ data: "ok", error: null });
    const outcome = await confirmAiActionAction({ actionId: "11111111-1111-4111-8111-111111111111" });
    expect(outcome).toMatchObject({ ok: true, card: { state: "DONE", link: "/admin/expenses" } });
    expect(state.rpc).toHaveBeenNthCalledWith(1, "record_operating_expense", expect.objectContaining({ amount_vnd: "1250000", target_account_id: "acc",
      settlement: "PAID_NOW", operation_id: "11111111-1111-4111-8111-111111111111" }));
    expect(state.rpc).toHaveBeenNthCalledWith(2, "finish_ai_action", expect.objectContaining({ new_state: "DONE" }));
  });

  it("keeps a failed action waiting with a Vietnamese reason, and refuses without the permission", async () => {
    state.tables.ai_actions = [{ id: "11111111-1111-4111-8111-111111111111", title: "Ghi chi", summary: [], state: "PENDING", result_link: null, result_message: null, kind: "soan_chi_phi", payload: {} }];
    state.rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
    const failed = await confirmAiActionAction({ actionId: "11111111-1111-4111-8111-111111111111" });
    expect(failed).toMatchObject({ ok: false, message: "Bạn không có quyền thực hiện thao tác này." });
    expect(state.rpc).not.toHaveBeenCalledWith("finish_ai_action", expect.anything());
    access.permissions = ["ai.use"];
    state.rpc.mockReset();
    expect(await confirmAiActionAction({ actionId: "11111111-1111-4111-8111-111111111111" })).toMatchObject({ ok: false });
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("does not run an action twice, and can dismiss", async () => {
    state.tables.ai_actions = [{ id: "11111111-1111-4111-8111-111111111111", title: "Ghi chi", summary: [], state: "DONE", result_link: "/admin/expenses", result_message: "Đã ghi", kind: "soan_chi_phi", payload: {} }];
    expect(await confirmAiActionAction({ actionId: "11111111-1111-4111-8111-111111111111" })).toMatchObject({ ok: true, message: "Thao tác đã được thực hiện." });
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpc.mockResolvedValue({ data: "x", error: null });
    expect(await dismissAiActionAction({ actionId: "11111111-1111-4111-8111-111111111111" })).toEqual({ ok: true, message: "Đã bỏ qua." });
    expect(state.rpc).toHaveBeenCalledWith("finish_ai_action", expect.objectContaining({ new_state: "CANCELLED" }));
  });

  it("asks back when a name matches several records", async () => {
    state.tables.customers = [{ id: "c1", code: "KH01", display_name: "Anh Minh Quận 7" }, { id: "c2", code: "KH02", display_name: "Anh Minh Thủ Đức" }];
    await expect(findCustomer(supabase as never, "b1", "anh minh")).rejects.toThrow(/Có nhiều khách hàng khớp "anh minh": KH01 Anh Minh Quận 7; KH02 Anh Minh Thủ Đức/);
    state.tables.customers = [{ id: "c2", code: "KH02", display_name: "Anh Minh Thủ Đức" }];
    await expect(findCustomer(supabase as never, "b1", "KH02")).resolves.toMatchObject({ id: "c2" });
  });
});
