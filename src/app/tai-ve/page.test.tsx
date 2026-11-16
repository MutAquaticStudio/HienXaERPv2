import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/company/sign-in-logo", () => ({ loadSignInLogoUrl: async () => { throw new Error("no database"); } }));
import InstallAppPage from "./page";

afterEach(cleanup);

it("D81: one app for the three portals, shown with its home-screen icon, even when the company logo cannot be read", async () => {
  render(await InstallAppPage());
  expect(screen.getByRole("heading", { level: 1, name: "Cài app Hiền Xa" })).toBeInTheDocument();
  expect(screen.getByText("Hiền Xa ERP")).toBeInTheDocument();
  const portals = within(screen.getByRole("list", { name: "Ba cổng trong app" })).getAllByRole("listitem");
  expect(portals.map((portal) => portal.textContent)).toEqual(["Vận hành", "Thợ & tài xế", "Khách hàng"]);
  expect(document.querySelector(".install-app-icon")).toHaveAttribute("src", "/apple-touch-icon.png");
  expect(screen.getByRole("link", { name: "← Về màn đăng nhập" })).toHaveAttribute("href", "/");
});
