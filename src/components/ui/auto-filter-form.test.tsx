import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AutoFilterForm, FILTER_TEXT_DEBOUNCE_MS } from "./auto-filter-form";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/admin/orders" }));

beforeEach(() => { vi.useFakeTimers(); router.replace.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function renderFilters() {
  return render(<AutoFilterForm aria-label="Bộ lọc đơn bán">
    <label>Tìm kiếm<input type="search" name="q" defaultValue="" /></label>
    <label>Trạng thái<select name="state" defaultValue=""><option value="">Đang làm việc</option><option value="CANCELLED">Đã hủy</option></select></label>
    <input type="hidden" name="page" value="3" />
    <input type="hidden" name="supplier" value="s-1" />
  </AutoFilterForm>);
}

it("applies a select change at once, keeps hidden context and restarts paging", () => {
  renderFilters();
  fireEvent.change(screen.getByLabelText("Trạng thái"), { target: { value: "CANCELLED" } });
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith("/admin/orders?state=CANCELLED&supplier=s-1", { scroll: false });
});

it("waits for a pause in typing before applying the search text", () => {
  renderFilters();
  const search = screen.getByLabelText("Tìm kiếm");
  fireEvent.change(search, { target: { value: "D" } });
  fireEvent.change(search, { target: { value: "DH0" } });
  act(() => { vi.advanceTimersByTime(FILTER_TEXT_DEBOUNCE_MS - 1); });
  expect(router.replace).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(1); });
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith("/admin/orders?q=DH0&supplier=s-1", { scroll: false });
});

it("applies immediately on Enter and drops empty values", () => {
  renderFilters();
  fireEvent.change(screen.getByLabelText("Tìm kiếm"), { target: { value: "  " } });
  fireEvent.submit(screen.getByRole("form", { name: "Bộ lọc đơn bán" }));
  expect(router.replace).toHaveBeenCalledWith("/admin/orders?supplier=s-1", { scroll: false });
  act(() => { vi.advanceTimersByTime(FILTER_TEXT_DEBOUNCE_MS); });
  expect(router.replace).toHaveBeenCalledTimes(1);
});

it("has no visible apply button when JavaScript runs", () => {
  renderFilters();
  expect(screen.queryByRole("button", { name: "Áp dụng" })).toBeNull();
});
