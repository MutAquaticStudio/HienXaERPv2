import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ permission: vi.fn(), client: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.permission, requireCustomerAccess: m.permission }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: m.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, notFound: m.notFound }));

import { QUOTATIONS_DISABLED_MESSAGE, QUOTATIONS_ENABLED } from "./features";
import { internalLandingPath } from "./access/landing";
import AdminQuotationsLayout from "@/app/admin/quotations/layout";
import CustomerQuotationsLayout from "@/app/customer/quotations/layout";
import { acceptCustomerQuotationAction, createQuotationAction, sendQuotationAction } from "@/modules/sales/actions";

beforeEach(() => vi.clearAllMocks());

it("keeps quotations switched off (owner decision D1)", () => {
  expect(QUOTATIONS_ENABLED).toBe(false);
});

it("never lands an actor on the quotation screen", () => {
  expect(internalLandingPath(new Set(["quotation.read", "customers.read"]))).toBe("/admin/customers");
  expect(() => internalLandingPath(new Set(["quotation.read"]))).toThrow();
});

it("answers every quotation route with not found", () => {
  expect(() => AdminQuotationsLayout({ children: null })).toThrow("NOT_FOUND");
  expect(() => CustomerQuotationsLayout({ children: null })).toThrow("NOT_FOUND");
});

it("rejects quotation commands before any permission or database call", async () => {
  const form = new FormData();
  await expect(createQuotationAction(undefined, form)).resolves.toEqual({ message: QUOTATIONS_DISABLED_MESSAGE });
  await expect(sendQuotationAction(form)).rejects.toThrow(`REDIRECT:/admin/orders?error=${encodeURIComponent(QUOTATIONS_DISABLED_MESSAGE)}`);
  await expect(acceptCustomerQuotationAction(form)).rejects.toThrow("REDIRECT:/customer?error=");
  expect(m.permission).not.toHaveBeenCalled();
  expect(m.client).not.toHaveBeenCalled();
});
