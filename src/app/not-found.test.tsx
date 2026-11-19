import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import NotFound from "./not-found";

it("says in Vietnamese that the page was not found and links home", () => {
  render(<NotFound />);
  expect(screen.getByRole("heading", { name: "Không tìm thấy trang" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Về trang chính" })).toHaveAttribute("href", "/");
});
