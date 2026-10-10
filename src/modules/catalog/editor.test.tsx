import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CatalogEditor } from "./editor";

vi.mock("./actions", () => ({ saveCatalogAction: vi.fn() }));
afterEach(cleanup);

it("shows Vietnamese customer types while retaining the submitted enum", () => {
  const { container } = render(<CatalogEditor kind="customers" options={{ salesOwners: [] }} />);
  const select = screen.getByLabelText("Loại khách");
  expect(screen.getByRole("option", { name: "Doanh nghiệp" })).toHaveValue("BUSINESS");
  expect(screen.getByRole("option", { name: "Cá nhân" })).toHaveValue("INDIVIDUAL");
  fireEvent.change(select, { target: { value: "INDIVIDUAL" } });
  expect(new FormData(container.querySelector("form")!).get("customer_type")).toBe("INDIVIDUAL");
  expect(select).not.toHaveTextContent("BUSINESS");
});

it("keeps conversion and rounding contracts when choices are localized", () => {
  const { container } = render(<CatalogEditor kind="conversions" options={{ materials: [], units: [] }} />);
  fireEvent.change(screen.getByLabelText("Loại quy đổi"), { target: { value: "VEHICLE_LOAD" } });
  fireEvent.change(screen.getByLabelText("Cách làm tròn"), { target: { value: "DOWN" } });
  const payload = new FormData(container.querySelector("form")!);
  expect(payload.get("conversion_type")).toBe("VEHICLE_LOAD");
  expect(payload.get("rounding_mode")).toBe("DOWN");
  expect(screen.getByLabelText("Loại quy đổi")).not.toHaveTextContent("VEHICLE_LOAD");
});
