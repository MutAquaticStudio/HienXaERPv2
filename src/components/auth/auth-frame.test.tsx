import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AuthFrame } from "./auth-frame";

afterEach(cleanup);

it("keeps each part of the sign-in footnote whole, with the dot only between them", () => {
  render(<AuthFrame footnote="Máy này nhớ cổng bạn dùng lần trước · Quên tài khoản: hỏi quản lý cửa hàng"><p>Thẻ</p></AuthFrame>);
  const note = document.querySelector(".auth-footnote")!;
  expect(note).toHaveTextContent("Máy này nhớ cổng bạn dùng lần trước · Quên tài khoản: hỏi quản lý cửa hàng");
  expect([...note.querySelectorAll(".auth-footnote-part")].map((part) => part.textContent)).toEqual(["Máy này nhớ cổng bạn dùng lần trước", "Quên tài khoản: hỏi quản lý cửa hàng"]);
  expect(note.querySelectorAll(".auth-footnote-dot")).toHaveLength(1);
  expect(screen.getByText("Thẻ")).toBeInTheDocument();
});
