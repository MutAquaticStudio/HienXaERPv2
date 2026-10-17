import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), permission: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: m.access, requireInternalPermission: m.permission }));

import DebtsPage from "./page";

const visit = (permissions: string[], tab?: string) => {
  m.access.mockResolvedValue({ permissions: new Set(permissions) });
  return DebtsPage({ searchParams: Promise.resolve(tab ? { tab } : {}) });
};
beforeEach(() => vi.clearAllMocks());

it("opens the debts tab the actor may read", async () => {
  await expect(visit(["finance.ar.read", "finance.ap.read"])).rejects.toThrow("REDIRECT:/admin/receivables");
  await expect(visit(["finance.ar.read", "finance.ap.read"], "phai-tra")).rejects.toThrow("REDIRECT:/admin/payables");
  await expect(visit(["finance.ap.read"])).rejects.toThrow("REDIRECT:/admin/payables");
  await expect(visit(["finance.ar.read"], "phai-tra")).rejects.toThrow("REDIRECT:/admin/receivables");
});

it("refuses an actor without either right through the usual permission check", async () => {
  m.permission.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(visit(["orders.read"])).rejects.toThrow("FORBIDDEN");
  expect(m.permission).toHaveBeenCalledWith("finance.ar.read");
});
