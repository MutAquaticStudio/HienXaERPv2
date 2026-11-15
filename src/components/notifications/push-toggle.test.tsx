import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/modules/notifications/push-actions", () => ({ savePushSubscriptionAction: vi.fn(), deletePushSubscriptionAction: vi.fn() }));
import { PushToggle } from "./push-toggle";

afterEach(cleanup);

it("says when push is not set up for the app", async () => {
  render(<PushToggle publicKey="" />);
  expect(await screen.findByText("Thông báo đẩy chưa được cấu hình cho ứng dụng.")).toBeInTheDocument();
});

it("explains the iPhone home-screen step when the browser cannot receive push", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
  render(<PushToggle publicKey="BOk" />);
  expect(await screen.findByText(/Thêm vào MH chính/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("D80: the home-screen card stays hidden when push is not set up", async () => {
  const { container } = render(<PushToggle publicKey="" prompt={{ title: "Báo việc mới về điện thoại", text: "Bật để điện thoại báo." }} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container.innerHTML).toBe("");
});

it("D80: the home-screen card explains the iPhone step under its heading", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
  render(<PushToggle publicKey="BOk" prompt={{ title: "Báo việc mới về điện thoại", text: "Bật để điện thoại báo." }} />);
  expect(await screen.findByRole("heading", { name: "Báo việc mới về điện thoại" })).toBeInTheDocument();
  expect(screen.getByText(/Thêm vào MH chính/)).toBeInTheDocument();
});

it("D82: inside the Android app it explains that the app has no push yet, and the home-screen card stays hidden", async () => {
  const app = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 HienXaAndroid/2.0.0";
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(app);
  render(<PushToggle publicKey="BOk" />);
  expect(await screen.findByText(/App Android chưa nhận được thông báo đẩy/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  cleanup();
  const { container } = render(<PushToggle publicKey="BOk" prompt={{ title: "Báo việc mới về điện thoại", text: "Bật để điện thoại báo." }} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container.innerHTML).toBe("");
});
