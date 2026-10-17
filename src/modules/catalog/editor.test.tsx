import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CatalogEditor } from "./editor";

vi.mock("./actions", () => ({ saveCatalogWithOutcomeAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ getCommandDraftAction: vi.fn(), lookupCommandOutcomeAction: vi.fn(), saveCommandDraftAction: vi.fn() }));
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

it("keeps a record's status out of the form: the Ngừng dùng / Dùng lại buttons change it", async () => {
  const first = render(<CatalogEditor kind="warehouses" options={{}} record={{ id: "a5dc6376-d7d1-4b08-97ad-188f849cabf8", active: true, name: "Kho đang dùng" }}
    operationId="a5dc6376-d7d1-4b08-97ad-188f849cabf8" scope="TEST:warehouses:active" />);
  await waitFor(() => expect(screen.getByLabelText("Tên *")).toBeEnabled());
  expect(screen.queryByLabelText("Đang sử dụng")).toBeNull();
  expect(new FormData(first.container.querySelector("form")!).get("active")).toBe("on");
  cleanup();
  const { container } = render(<CatalogEditor kind="warehouses" options={{}} record={{ id: "b5dc6376-d7d1-4b08-97ad-188f849cabf8", active: false, name: "Kho đã ngừng" }}
    operationId="b5dc6376-d7d1-4b08-97ad-188f849cabf8" scope="TEST:warehouses:stopped" />);
  await waitFor(() => expect(screen.getByLabelText("Tên *")).toHaveValue("Kho đã ngừng"));
  expect(new FormData(container.querySelector("form")!).get("active")).toBeNull();
});

it("shows Vietnamese customer types while retaining the submitted enum", async () => {
  const { container } = render(<CatalogEditor kind="customers" options={{ salesOwners: [] }} operationId="a5dc6376-d7d1-4b08-97ad-188f849cabf8" scope="TEST:customers" />);
  const select = screen.getByLabelText("Loại khách");
  await waitFor(() => expect(select).toBeEnabled());
  expect(screen.getByRole("option", { name: "Doanh nghiệp" })).toHaveValue("BUSINESS");
  expect(screen.getByRole("option", { name: "Cá nhân" })).toHaveValue("INDIVIDUAL");
  fireEvent.change(select, { target: { value: "INDIVIDUAL" } });
  expect(new FormData(container.querySelector("form")!).get("customer_type")).toBe("INDIVIDUAL");
  expect(select).not.toHaveTextContent("BUSINESS");
});

it("keeps conversion and rounding contracts when choices are localized", async () => {
  const { container } = render(<CatalogEditor kind="conversions" options={{ materials: [], units: [] }} operationId="a5dc6376-d7d1-4b08-97ad-188f849cabf8" scope="TEST:conversions" />);
  await waitFor(() => expect(screen.getByLabelText("Loại quy đổi")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Loại quy đổi"), { target: { value: "VEHICLE_LOAD" } });
  fireEvent.change(screen.getByLabelText("Cách làm tròn"), { target: { value: "DOWN" } });
  const payload = new FormData(container.querySelector("form")!);
  expect(payload.get("conversion_type")).toBe("VEHICLE_LOAD");
  expect(payload.get("rounding_mode")).toBe("DOWN");
  expect(screen.getByLabelText("Loại quy đổi")).not.toHaveTextContent("VEHICLE_LOAD");
});
