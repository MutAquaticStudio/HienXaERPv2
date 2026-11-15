import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  class PortalRpcError extends Error {
    code?: string; rawMessage: string;
    constructor(error: { message: string; code?: string }) { super(error.message); this.code = error.code; this.rawMessage = error.message; }
  }
  return { access: vi.fn(), board: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }), PortalRpcError };
});
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: m.access }));
vi.mock("@/modules/portal/field-dispatch-server", () => ({ loadFieldDispatchBoard: m.board }));
vi.mock("@/modules/portal/server", () => ({ PortalRpcError: m.PortalRpcError }));
vi.mock("@/components/portal/field-dispatch-board", () => ({ FieldDispatchBoardView: ({ board }: { board: { waiting: unknown[] } }) => <p>Bảng điều phối · {board.waiting.length}</p> }));
import Page from "./page";

beforeEach(() => { vi.clearAllMocks(); m.board.mockResolvedValue({ waiting: [{}, {}], given: [] }); });
afterEach(cleanup);

it("opens the board only for a lead worker of the branch", async () => {
  m.access.mockResolvedValue({ branchId: "b1", permissions: new Set(["work.read", "work.claim", "work.field_dispatch"]) });
  render(await Page());
  expect(screen.getByText("Bảng điều phối · 2")).toBeTruthy();
  expect(m.board).toHaveBeenCalledWith("b1");
  expect(m.access).toHaveBeenCalledWith("/work/login");
});

it("sends an ordinary worker back to Hôm nay, even by the direct link", async () => {
  m.access.mockResolvedValue({ branchId: "b1", permissions: new Set(["work.read", "work.claim"]) });
  await expect(Page()).rejects.toThrow("redirect:/work");
  expect(m.board).not.toHaveBeenCalled();
});

it("sends back a lead whose grant was just taken away", async () => {
  m.access.mockResolvedValue({ branchId: "b1", permissions: new Set(["work.field_dispatch"]) });
  m.board.mockRejectedValueOnce(new m.PortalRpcError({ code: "42501", message: "forbidden" }));
  await expect(Page()).rejects.toThrow("redirect:/work");
});
