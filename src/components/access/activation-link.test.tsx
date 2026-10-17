import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({ createActivationLinkAction: vi.fn() }));
import { ActivationLinkBox } from "./activation-link";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the activation link and copies it for Zalo or a text message", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<ActivationLinkBox link="https://app.example.test/recovery/confirm?surface=work&token_hash=h&type=invite" />);
  expect(screen.getByLabelText("Link kích hoạt")).toHaveValue("https://app.example.test/recovery/confirm?surface=work&token_hash=h&type=invite");
  fireEvent.click(screen.getByRole("button", { name: "Sao chép link" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Đã sao chép" })).toBeInTheDocument());
  expect(writeText).toHaveBeenCalledWith("https://app.example.test/recovery/confirm?surface=work&token_hash=h&type=invite");
  expect(screen.queryByRole("button", { name: "Gửi qua Zalo / tin nhắn" })).not.toBeInTheDocument();
});
