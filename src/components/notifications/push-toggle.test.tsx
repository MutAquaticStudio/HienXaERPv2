import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ saveApp: vi.fn(), deleteApp: vi.fn() }));
vi.mock("@/modules/notifications/push-actions", () => ({ savePushSubscriptionAction: vi.fn(), deletePushSubscriptionAction: vi.fn(),
  saveAppPushTokenAction: m.saveApp, deleteAppPushTokenAction: m.deleteApp }));
import { forgetAppPushRegistration } from "./app-push";
import { PushToggle } from "./push-toggle";

const APP = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 HienXaAndroid";
const PROMPT = { title: "Báo việc mới về điện thoại", text: "Bật để điện thoại báo." };

/** The Android app 2.3.0's window.HienXaAndroid, answering like MainActivity.Bridge. */
function installApp(state: { token: string; permission: string }) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(`${APP}/2.3.0`);
  const bridge = { pushToken: vi.fn(() => state.token), pushPermission: vi.fn(() => state.permission), requestPush: vi.fn(), saveFile: vi.fn() };
  Object.assign(window, { HienXaAndroid: bridge });
  return bridge;
}
const appAnswers = (token: string) => act(async () => { window.dispatchEvent(new CustomEvent("hx-push-token", { detail: token })); });

beforeEach(() => { m.saveApp.mockResolvedValue(true); m.deleteApp.mockResolvedValue(true); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as Window & { HienXaAndroid?: unknown }).HienXaAndroid;
  forgetAppPushRegistration();
});

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
  const { container } = render(<PushToggle publicKey="" prompt={PROMPT} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container.innerHTML).toBe("");
});

it("D80: the home-screen card explains the iPhone step under its heading", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
  render(<PushToggle publicKey="BOk" prompt={PROMPT} />);
  expect(await screen.findByRole("heading", { name: "Báo việc mới về điện thoại" })).toBeInTheDocument();
  expect(screen.getByText(/Thêm vào MH chính/)).toBeInTheDocument();
});

it("D82: an app older than 2.3.0 cannot receive push: it says so, and the home-screen card stays hidden", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(`${APP}/2.2.0`);
  render(<PushToggle publicKey="BOk" />);
  expect(await screen.findByText(/Bản app Hiền Xa trên máy này chưa nhận được thông báo đẩy/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  cleanup();
  const { container } = render(<PushToggle publicKey="BOk" prompt={PROMPT} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container.innerHTML).toBe("");
});

it("D86: in the app with notifications allowed, the phone is registered without a tap and the card stays hidden", async () => {
  installApp({ token: "fcmToggleToken:APA91b" + "a".repeat(40), permission: "granted" });
  render(<PushToggle publicKey="" />);
  expect(await screen.findByText(/Máy này đang nhận thông báo\. Muốn tắt: Cài đặt của điện thoại/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(m.saveApp).toHaveBeenCalledWith({ token: "fcmToggleToken:APA91b" + "a".repeat(40), platform: "ANDROID", userAgent: `${APP}/2.3.0` });
  cleanup();
  const { container } = render(<PushToggle prompt={PROMPT} />);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(container.innerHTML).toBe("");
  expect(m.saveApp).toHaveBeenCalledTimes(1);
});

it("D86: 'Bật thông báo trên máy này' asks the app, then saves the token it hands back", async () => {
  const state = { token: "", permission: "default" };
  const bridge = installApp(state);
  render(<PushToggle prompt={PROMPT} />);
  fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo trên máy này" }));
  expect(bridge.requestPush).toHaveBeenCalled();
  expect(m.saveApp).not.toHaveBeenCalled();
  // Android's "Cho phép" answered: the app fires hx-push-token with the phone's token.
  state.permission = "granted";
  state.token = "fcmToggleToken:APA91b" + "b".repeat(40);
  await appAnswers(state.token);
  expect(await screen.findByText("Đã bật. Điện thoại sẽ báo khi có việc mới.")).toBeInTheDocument();
  expect(m.saveApp).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("D86: refused in Android, the button stays with a hint; blocked for good, it explains where to switch it on", async () => {
  const state = { token: "fcmToggleToken:APA91b" + "c".repeat(40), permission: "default" };
  installApp(state);
  render(<PushToggle />);
  fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo trên máy này" }));
  await appAnswers(state.token);
  expect(await screen.findByText("Chưa được phép gửi thông báo. Bấm lại và chọn “Cho phép”.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Bật thông báo trên máy này" })).toBeInTheDocument();
  expect(m.saveApp).not.toHaveBeenCalled();
  cleanup();
  state.permission = "denied";
  render(<PushToggle />);
  expect(await screen.findByText(/Máy này đang chặn thông báo của app Hiền Xa/)).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
