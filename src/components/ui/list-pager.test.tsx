import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ListPager } from "./list-pager";

afterEach(cleanup);

describe("bounded list pager", () => {
  it("preserves filters and shows the next page only when a sentinel row exists", () => {
    render(<ListPager page={2} hasNext params={{ q: "khách A", state: "OVERDUE" }} />);
    expect(screen.getByText("Trang 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trang trước" })).toHaveAttribute("href", "?q=kh%C3%A1ch+A&state=OVERDUE");
    expect(screen.getByRole("link", { name: "Trang sau" })).toHaveAttribute("href", "?q=kh%C3%A1ch+A&state=OVERDUE&page=3");
  });

  it("does not invent an exact count or a next page", () => {
    render(<ListPager page={1} hasNext={false} params={{}} />);
    expect(screen.getByText("Trang 1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trang sau" })).not.toBeInTheDocument();
    expect(screen.queryByText(/kết quả/)).not.toBeInTheDocument();
  });
});
