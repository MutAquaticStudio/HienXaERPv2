import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({ loginAction: vi.fn() }));
import { LoginForm, REMEMBER_CHOICE_KEY, rememberedLoginKey } from "./login-form";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const account = () => screen.getByLabelText("Email hoặc số điện thoại") as HTMLInputElement;
const remember = () => screen.getByRole("checkbox", { name: "Ghi nhớ đăng nhập trên thiết bị này" }) as HTMLInputElement;
const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Đăng nhập" }).closest("form")!);

it("remembers the login by default and fills in the account name next time (D77)", () => {
  render(<LoginForm surface="work" />);
  expect(remember().checked).toBe(true);
  expect(remember()).toHaveAccessibleDescription(/không làm thoát các thiết bị khác/);
  fireEvent.change(account(), { target: { value: " 0912345678 " } });
  submit();
  expect(localStorage.getItem(rememberedLoginKey("work"))).toBe("0912345678");
  cleanup();
  render(<LoginForm surface="work" />);
  expect(account().value).toBe("0912345678");
  expect(remember().checked).toBe(true);
});

it("forgets the account name and keeps the box off when the person signs in without remembering (shared device)", () => {
  localStorage.setItem(rememberedLoginKey("customer"), "khach@vidu.vn");
  render(<LoginForm surface="customer" />);
  expect(account().value).toBe("khach@vidu.vn");
  fireEvent.click(remember());
  submit();
  expect(localStorage.getItem(rememberedLoginKey("customer"))).toBeNull();
  expect(localStorage.getItem(REMEMBER_CHOICE_KEY)).toBe("0");
  cleanup();
  render(<LoginForm surface="customer" />);
  expect(account().value).toBe("");
  expect(remember().checked).toBe(false);
});

it("keeps each portal's account name apart", () => {
  localStorage.setItem(rememberedLoginKey("admin"), "vanphong@hienxa.vn");
  render(<LoginForm surface="work" />);
  expect(account().value).toBe("");
});

it("starts with the box off right after a shared device signed out, although its storage was wiped (D77)", () => {
  window.history.replaceState(null, "", "/?portal=work&remember=off");
  render(<LoginForm surface="work" />);
  expect(remember().checked).toBe(false);
  submit();
  expect(localStorage.getItem(REMEMBER_CHOICE_KEY)).toBe("0");
  window.history.replaceState(null, "", "/");
});
