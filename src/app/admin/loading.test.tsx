import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import AdminLoading from "./loading";

it("keeps a labelled placeholder in the office frame while a screen loads", () => {
  render(<AdminLoading />);
  expect(screen.getByRole("status", { name: "Đang tổng hợp số liệu" })).toBeInTheDocument();
  expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(10);
});
