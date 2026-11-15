import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { detectDevice, InstallGuide } from "./install-guide";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1";
const IPHONE_ZALO = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const as = (agent: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);

it("tells the phones apart; Zalo and Chrome on iPhone are not Safari; opened from the home screen counts as installed", () => {
  expect(detectDevice(ANDROID, false)).toBe("android");
  expect(detectDevice(IPHONE_SAFARI, false)).toBe("ios-safari");
  expect(detectDevice(IPHONE_CHROME, false)).toBe("ios-other");
  expect(detectDevice(IPHONE_ZALO, false)).toBe("ios-other");
  expect(detectDevice(DESKTOP, false)).toBe("desktop");
  expect(detectDevice(IPHONE_SAFARI, true)).toBe("installed");
});

it("Android: the APK button and its three steps only", async () => {
  as(ANDROID);
  render(<InstallGuide />);
  expect((await screen.findByRole("link", { name: "Tải app Android" })).getAttribute("href")).toBe("/app/hien-xa.apk");
  expect(screen.getByText(/cài ứng dụng từ nguồn này/)).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "iPhone" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem cách cài cho máy khác" }));
  expect(screen.getByRole("heading", { name: "iPhone" })).toBeInTheDocument();
});

it("iPhone Safari: Share → Thêm vào MH chính; in Chrome or Zalo it first asks to open Safari", async () => {
  as(IPHONE_SAFARI);
  render(<InstallGuide />);
  expect(await screen.findByText("Thêm vào MH chính")).toBeInTheDocument();
  expect(screen.queryByText(/chỉ cài được từ/)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Tải app Android" })).not.toBeInTheDocument();
  cleanup();
  as(IPHONE_ZALO);
  render(<InstallGuide />);
  expect(await screen.findByText(/chỉ cài được từ/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Chép link cài app" })).toBeInTheDocument();
});

it("a computer shows both ways and the link to send by Zalo", async () => {
  as(DESKTOP);
  render(<InstallGuide />);
  expect(await screen.findByRole("heading", { name: "Gửi cho nhân viên, khách hàng" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Điện thoại Android" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "iPhone" })).toBeInTheDocument();
});
