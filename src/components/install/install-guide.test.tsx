import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { detectDevice, InstallGuide } from "./install-guide";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const IPHONE_ZALO = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, "clipboard"); });
const as = (agent: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);

it("tells the phones apart; Zalo and Chrome on iPhone are not Safari; opened from the home screen counts as installed", () => {
  expect(detectDevice(ANDROID, false)).toBe("android");
  expect(detectDevice(IPHONE_SAFARI, false)).toBe("ios-safari");
  expect(detectDevice(IPHONE_CHROME, false)).toBe("ios-other");
  expect(detectDevice(IPHONE_ZALO, false)).toBe("ios-other");
  expect(detectDevice(DESKTOP, false)).toBe("desktop");
  expect(detectDevice(IPHONE_SAFARI, true)).toBe("installed");
  expect(detectDevice(`${ANDROID} HienXaAndroid/2.0.0`, false)).toBe("installed");
});

/** The words of each numbered step, in order, as a screen reader gets them (the drawing under a step is hidden). */
const steps = (section: HTMLElement) => within(section).getAllByRole("listitem").map((item) => {
  const words = item.cloneNode(true) as HTMLElement;
  words.querySelectorAll("[aria-hidden='true']").forEach((drawing) => drawing.remove());
  return words.textContent ?? "";
});
const section = (name: string) => screen.getByRole("region", { name });

it("Android: the APK button, Android 7 or newer, three numbered steps; the other phone opens under it and takes the focus", async () => {
  as(ANDROID);
  render(<InstallGuide />);
  expect((await screen.findByRole("link", { name: "Tải app Android" })).getAttribute("href")).toBe("/app/hien-xa.apk");
  const android = section("Điện thoại Android");
  expect(within(android).getByText("Android 7 trở lên")).toBeInTheDocument();
  expect(steps(android)).toEqual([
    "Bấm Tải app Android, tải xong thì mở tệp hien-xa.apk.",
    "Nếu máy hỏi, cho phép cài ứng dụng từ nguồn này, rồi bấm Cài đặt (đã có app cũ: bấm Cập nhật, không cần gỡ).",
    "Mở app Hiền Xa, đăng nhập đúng tab của mình. Khi app hỏi, cho phép Máy ảnh và Vị trí để chụp ảnh giao hàng và chấm công.",
  ]);
  // The Android app needs no Chrome and has no notifications yet.
  expect(android.textContent).not.toMatch(/Chrome|thông báo/);
  expect(screen.queryByText(/Đang mở trong Zalo/)).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "iPhone" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem cách cài cho máy khác" }));
  const iphone = screen.getByRole("heading", { name: "iPhone" });
  expect(iphone).toHaveFocus();
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Điện thoại Android", "iPhone"]);
  expect(screen.queryByRole("button", { name: "Xem cách cài cho máy khác" })).not.toBeInTheDocument();
});

it("Android inside Zalo or Facebook: says to open the page in the browser if the download does not start", async () => {
  as(`${ANDROID} Zalo android`);
  render(<InstallGuide />);
  expect(await screen.findByRole("note")).toHaveTextContent("Mở bằng trình duyệt");
});

it("iPhone Safari: Share → Thêm vào MH chính, notifications from Hồ sơ; the Android way opens under it", async () => {
  as(IPHONE_SAFARI);
  render(<InstallGuide />);
  const iphone = await screen.findByRole("region", { name: "iPhone" });
  expect(steps(iphone)).toEqual([
    "Trong Safari, bấm nút Chia sẻ ở thanh dưới (iPad: góc trên).",
    "Chọn Thêm vào MH chính (kéo xuống nếu chưa thấy), rồi bấm Thêm.",
    "Mở app Hiền Xa trên màn hình chính và đăng nhập.",
  ]);
  // Each step also draws what to look for on the phone, hidden from screen readers so nothing is read twice.
  expect(within(iphone).getAllByText("Thêm vào MH chính").map((text) => text.closest("[aria-hidden='true']") !== null)).toEqual([false, true]);
  expect(within(iphone).getByText(/để nhận việc mới \(iOS 16\.4 trở lên\)/)).toHaveTextContent("Thợ & tài xế: vào Hồ sơ → Bật thông báo trên máy này");
  expect(screen.queryByText(/chỉ cài được từ/)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Tải app Android" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem cách cài cho máy khác" }));
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["iPhone", "Điện thoại Android"]);
  expect(screen.getByRole("heading", { name: "Điện thoại Android" })).toHaveFocus();
});

it("iPhone in Zalo or Chrome: first asks to open Safari and copies the link to paste there", async () => {
  as(IPHONE_ZALO);
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<InstallGuide />);
  expect(await screen.findByText(/chỉ cài được từ/)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Chép link cài app" })); });
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/tai-ve`);
  expect(screen.getByRole("button", { name: "Đã chép link" })).toBeInTheDocument();
});

it("a computer: the link to send by Zalo first, then both ways", async () => {
  as(DESKTOP);
  render(<InstallGuide />);
  const share = await screen.findByRole("region", { name: "Gửi cho nhân viên, khách hàng" });
  expect(within(share).getByText(`${window.location.host}/tai-ve`)).toBeInTheDocument();
  expect(within(share).getByRole("button", { name: "Chép link trang này" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent))
    .toEqual(["Gửi cho nhân viên, khách hàng", "Điện thoại Android", "iPhone"]);
  // Read from a computer, the iPhone way only says "from Safari"; the warning is for an iPhone in another browser.
  expect(within(section("iPhone")).getByText("Cài từ Safari")).toBeInTheDocument();
  expect(screen.queryByText(/chỉ cài được từ/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Xem cách cài cho máy khác" })).not.toBeInTheDocument();
});

it("opened from the home screen: says the app is installed and leads to sign-in instead of the steps", async () => {
  as(IPHONE_SAFARI);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)" }));
  render(<InstallGuide />);
  expect(await screen.findByRole("status")).toHaveTextContent("App Hiền Xa đã được cài trên máy này.");
  expect(screen.getByRole("link", { name: "Mở trang đăng nhập" })).toHaveAttribute("href", "/");
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
