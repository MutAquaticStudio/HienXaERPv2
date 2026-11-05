import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/modules/ai/actions", () => ({ askAiAction: vi.fn(), listAiProposalsAction: vi.fn(async () => ({ proposals: [], canDecide: false })), newAiChatAction: vi.fn() }));
vi.mock("@/modules/ai/agent/actions", () => ({ listAiActionsAction: vi.fn(async () => []) }));
vi.mock("@/modules/ai/agent/action-card", () => ({ AiActionCardView: () => null }));
vi.mock("@/components/messaging/messaging-controls", () => ({ ScrollToEnd: () => null }));
import { AiChat, TurnAttachments, visibleTurnText } from "./chat";

afterEach(cleanup);
const items = [{ name: "hoa-don.jpg", mime: "image/jpeg", size: 120000, url: "https://x.supabase.co/sign/1" },
  { name: "khach.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 9000 },
  { name: "bao-gia.pdf", mime: "application/pdf", size: 50000, url: "https://x.supabase.co/sign/2" }];

it("D63: shows pictures as thumbnails that open large, other files as chips; a broken picture falls back to its name", () => {
  render(<TurnAttachments items={items} />);
  const thumb = screen.getByRole("button", { name: "Xem ảnh hoa-don.jpg" });
  expect(within(thumb).getByRole("img")).toHaveAttribute("src", "https://x.supabase.co/sign/1");
  expect(screen.getByText("khach.xlsx")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mở" })).toHaveAttribute("href", "https://x.supabase.co/sign/2");
  fireEvent.click(thumb);
  expect(screen.getByRole("dialog", { name: "hoa-don.jpg" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mở ảnh gốc" })).toHaveAttribute("href", "https://x.supabase.co/sign/1");
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  fireEvent.error(within(thumb).getByRole("img"));
  expect(screen.queryByRole("button", { name: "Xem ảnh hoa-don.jpg" })).not.toBeInTheDocument();
  expect(screen.getByText("hoa-don.jpg")).toBeInTheDocument();
});

it("replaces the “📎 names” line of a kept question by its files, and leaves older turns as they were", () => {
  expect(visibleTurnText({ role: "user", text: "Đọc giúp\n📎 hoa-don.jpg", attachments: [items[0]] })).toBe("Đọc giúp");
  expect(visibleTurnText({ role: "user", text: "Đọc giúp\n📎 hoa-don.jpg" })).toBe("Đọc giúp\n📎 hoa-don.jpg");
  render(<AiChat initialTurns={[{ role: "user", text: "Đọc giúp\n📎 hoa-don.jpg", attachments: [items[0]] }, { role: "assistant", text: "Hóa đơn 1.250.000 ₫." }]} />);
  expect(screen.getByRole("button", { name: "Xem ảnh hoa-don.jpg" })).toBeInTheDocument();
  expect(screen.queryByText(/📎/)).not.toBeInTheDocument();
});
