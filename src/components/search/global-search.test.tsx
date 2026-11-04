import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ push: vi.fn(), search: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock("@/modules/search/actions", () => ({ globalSearchAction: m.search }));
import { GlobalSearch } from "./global-search";

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const answer = { exact: null, groups: [
  { key: "customers", label: "Khách hàng", hits: [{ id: "c1", href: "/admin/customers/c1", title: "An Phát", detail: "KH01" }] },
  { key: "orders", label: "Đơn bán", hits: [{ id: "o1", href: "/admin/orders/o1", title: "SO-2026-000079", detail: "An Phát", badge: "Đã xác nhận" }] },
] };

it("opens with Ctrl K, searches after a pause and opens the chosen hit with the arrow keys and Enter", async () => {
  m.search.mockResolvedValue(answer);
  render(<GlobalSearch />);
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const box = screen.getByRole("combobox", { name: "Tìm đơn, phiếu giao, khách, SĐT, vật tư" });
  expect(document.activeElement).toBe(box);
  fireEvent.change(box, { target: { value: "an phat" } });
  expect(m.search).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(250); });
  expect(m.search).toHaveBeenCalledWith("an phat");
  expect(screen.getByRole("group", { name: "Khách hàng" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /An Phát/, selected: true })).toBeInTheDocument();
  fireEvent.keyDown(box, { key: "ArrowDown" });
  expect(screen.getByRole("option", { name: /SO-2026-000079/ })).toHaveAttribute("aria-selected", "true");
  fireEvent.keyDown(box, { key: "Enter" });
  expect(m.push).toHaveBeenCalledWith("/admin/orders/o1");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("goes straight to a document typed by its exact number, and Esc closes", async () => {
  m.search.mockResolvedValue({ ...answer, exact: "/admin/deliveries/d9" });
  render(<GlobalSearch />);
  fireEvent.click(screen.getByRole("button", { name: "Tìm đơn, phiếu giao, khách, vật tư" }));
  const box = screen.getByRole("combobox");
  fireEvent.change(box, { target: { value: "DL-2026-000039" } });
  await act(async () => { vi.advanceTimersByTime(250); });
  fireEvent.keyDown(box, { key: "Enter" });
  expect(m.push).toHaveBeenCalledWith("/admin/deliveries/d9");
  fireEvent.click(screen.getByRole("button", { name: "Tìm đơn, phiếu giao, khách, vật tư" }));
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("says so when nothing matches", async () => {
  m.search.mockResolvedValue({ exact: null, groups: [] });
  render(<GlobalSearch />);
  fireEvent.click(screen.getByRole("button", { name: "Tìm đơn, phiếu giao, khách, vật tư" }));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
  await act(async () => { vi.advanceTimersByTime(250); });
  expect(screen.getByRole("status")).toHaveTextContent("Không thấy “zzz”");
});
