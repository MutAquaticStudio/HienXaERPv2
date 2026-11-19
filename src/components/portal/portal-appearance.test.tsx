import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PortalAppearance } from "./portal-appearance";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";

const root = document.documentElement;
afterEach(() => {
  cleanup();
  document.cookie = "hx-appearance=; path=/; max-age=0";
  for (const name of ["data-theme", "data-color", "data-font-size", "data-font"]) root.removeAttribute(name);
  vi.unstubAllGlobals();
});

it("D84: offers Sáng / Tối / Theo thiết bị and the text size, not the font, with the saved choice selected", () => {
  render(<PortalAppearance initial={{ ...DEFAULT_APPEARANCE, theme: "dark", fontSize: "lg" }} />);
  const section = screen.getByRole("region", { name: "Giao diện" });
  const mode = within(section).getByRole("group", { name: "Chế độ màu" });
  expect(within(mode).getAllByRole("radio").map((radio) => radio.parentElement?.textContent?.trim())).toEqual(["Sáng", "Tối", "Theo thiết bị"]);
  expect(within(mode).getByLabelText("Tối")).toBeChecked();
  expect(within(section).getByRole("group", { name: "Cỡ chữ" })).toBeInTheDocument();
  expect(within(section).getByLabelText("Lớn")).toBeChecked();
  expect(within(section).queryByRole("group", { name: "Phông chữ" })).not.toBeInTheDocument();
});

it("D84: choosing Tối darkens this device at once and keeps it in the shared appearance cookie", () => {
  render(<PortalAppearance initial={DEFAULT_APPEARANCE} />);
  expect(screen.getByLabelText("Sáng")).toBeChecked();
  fireEvent.click(screen.getByLabelText("Tối"));
  expect(root.getAttribute("data-theme")).toBe("dark");
  expect(root.getAttribute("data-color")).toBe("dark");
  // The same cookie as the office's Cài đặt → Giao diện, so one choice covers every portal on the phone.
  expect(document.cookie).toContain("hx-appearance=dark.md.be-vietnam");
  expect(screen.getByRole("status")).toHaveTextContent("Đã áp dụng trên thiết bị này.");

  fireEvent.click(screen.getByLabelText("Lớn"));
  expect(root.getAttribute("data-font-size")).toBe("lg");
  expect(document.cookie).toContain("hx-appearance=dark.lg.be-vietnam");

  fireEvent.click(screen.getByLabelText("Sáng"));
  expect(root.getAttribute("data-color")).toBe("light");
  expect(document.cookie).toContain("hx-appearance=light.lg.be-vietnam");
});

it("D84: Theo thiết bị follows the phone's own light or dark setting", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("dark"), media: query }));
  render(<PortalAppearance initial={DEFAULT_APPEARANCE} />);
  fireEvent.click(screen.getByLabelText("Theo thiết bị"));
  expect(root.getAttribute("data-theme")).toBe("system");
  expect(root.getAttribute("data-color")).toBe("dark");
  expect(document.cookie).toContain("hx-appearance=system.md.be-vietnam");
});
