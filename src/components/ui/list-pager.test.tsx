import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ListPager, pageWindow } from "./list-pager";

afterEach(cleanup);

describe("bounded list pager", () => {
  it("preserves filters and shows the next page only when a sentinel row exists", () => {
    render(<ListPager page={2} hasNext params={{ q: "khách A", state: "OVERDUE" }} />);
    expect(screen.getByText("Trang 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trang trước" })).toHaveAttribute("href", "?q=kh%C3%A1ch+A&state=OVERDUE");
    expect(screen.getByRole("link", { name: "Trang sau" })).toHaveAttribute("href", "?q=kh%C3%A1ch+A&state=OVERDUE&page=3");
    // Without an exact count there is no page number to type.
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });

  it("shows nothing for an empty list or a single page without a count, and never invents a next page", () => {
    const { container, rerender } = render(<ListPager page={1} hasNext={false} params={{}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ListPager page={1} total={0} params={{}} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ListPager page={1} total={12} params={{}} />);
    expect(screen.getByText("12 kết quả")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("numbers the pages around the current one and jumps to a typed page keeping the filters", () => {
    render(<ListPager page={6} total={1987} params={{ q: "An Phát", state: "CONFIRMED", seller: undefined }} />);
    const pager = screen.getByRole("navigation", { name: "Phân trang" });
    expect(within(pager).getByText("Trang 6 / 80 · 1.987 kết quả")).toBeInTheDocument();
    expect(within(pager).getByText("6")).toHaveAttribute("aria-current", "page");
    for (const value of [1, 4, 5, 7, 8, 80]) {
      expect(within(pager).getByRole("link", { name: `Trang ${value}` })).toHaveAttribute("href", value === 1 ? "?q=An+Ph%C3%A1t&state=CONFIRMED" : `?q=An+Ph%C3%A1t&state=CONFIRMED&page=${value}`);
    }
    expect(within(pager).queryByRole("link", { name: "Trang 3" })).not.toBeInTheDocument();
    expect(within(pager).getAllByText("…")).toHaveLength(2);

    const input = within(pager).getByRole("spinbutton", { name: "Đến trang" });
    expect(input).toHaveAttribute("name", "page");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("max", "80");
    const form = input.closest("form")!;
    expect(form).toHaveAttribute("method", "get");
    const hidden = Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((field) => [field.name, field.value]));
    expect(hidden).toEqual({ q: "An Phát", state: "CONFIRMED" });
    expect(within(pager).getByRole("button", { name: "Đi" })).toHaveAttribute("type", "submit");
  });

  it("offers the jump box only from six pages and lets a page past the end go back", () => {
    const { rerender } = render(<ListPager page={2} total={60} params={{}} />);
    expect(screen.getByText("Trang 2 / 3 · 60 kết quả")).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    rerender(<ListPager page={9} total={60} params={{}} />);
    expect(screen.getByRole("link", { name: "Trang trước" })).toHaveAttribute("href", "?page=8");
    expect(screen.getByRole("link", { name: "Trang 3" })).toHaveAttribute("href", "?page=3");
    expect(screen.queryByRole("link", { name: "Trang sau" })).not.toBeInTheDocument();
  });
});

describe("page number window", () => {
  it.each([
    [1, 1, [1]],
    [1, 5, [1, 2, 3, 4, 5]],
    [1, 10, [1, 2, 3, null, 10]],
    [5, 10, [1, 2, 3, 4, 5, 6, 7, null, 10]],
    [6, 80, [1, null, 4, 5, 6, 7, 8, null, 80]],
    [80, 80, [1, null, 78, 79, 80]],
    [99, 3, [1, 2, 3]],
  ])("page %i of %i", (page, pages, expected) => {
    expect(pageWindow(page, pages)).toEqual(expected);
  });
});
