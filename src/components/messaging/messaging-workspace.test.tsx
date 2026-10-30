import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/modules/messaging/server", () => ({ loadMessenger: mocks.load }));
vi.mock("@/modules/messaging/actions", () => ({ sendMessageAction: vi.fn(), sendDirectMessageAction: vi.fn() }));
vi.mock("@/modules/ai/agent/actions", () => ({ listAiActionsAction: vi.fn(async () => []), confirmAiActionAction: vi.fn(), dismissAiActionAction: vi.fn() }));
vi.mock("@/modules/ai/actions", () => ({ askAiAction: vi.fn(), newAiChatAction: vi.fn(), decideAiProposalAction: vi.fn() }));
vi.mock("./messaging-controls", async (original) => ({ ...(await original<typeof import("./messaging-controls")>()), MessageRefreshSignal: () => null }));

import { MessagingWorkspace } from "./messaging-workspace";

const contact = (name: string, extra: Record<string, unknown> = {}) => ({ auth_user_id: `id-${name}`, contact_kind: "EMPLOYEE", display_name: name, subtitle: "Kế toán",
  customer_id: null, conversation_id: null, last_message_preview: null, last_message_at: null, unread_count: 0, ...extra });
afterEach(cleanup);

it("lists the assistant first, then the contacts with unread counts, and searches by name", async () => {
  mocks.load.mockResolvedValue({ contacts: [contact("Chị Lan", { conversation_id: "c1", last_message_preview: "Mai giao nhé", unread_count: 2 }), contact("Anh Minh")],
    others: [{ conversation_id: "c9", subject: "Lịch giao tuần", participant_summary: "A, B", last_message_preview: null, updated_at: "2026-10-01T00:00:00Z", unread_count: 0 }],
    thread: null, me: "me", canAi: true, surface: "admin" });
  render(await MessagingWorkspace({ surface: "admin", searchParams: Promise.resolve({}) }));
  const list = screen.getByRole("list", { name: "Danh bạ" });
  const links = within(list).getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual(["Trợ lý AIHỏi về số liệu bạn có quyền xem", "CLChị LanMai giao nhé2", "AMAnh MinhKế toán"]);
  expect(links[1]).toHaveAttribute("href", "/admin/messages?conversation=c1");
  expect(links[2]).toHaveAttribute("href", "/admin/messages?contact=id-Anh+Minh&customer=");
  expect(screen.getByRole("list", { name: "Hội thoại khác" })).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("Tìm người…"), { target: { value: "minh" } });
  expect(within(screen.getByRole("list", { name: "Danh bạ" })).getAllByRole("link").map((link) => link.textContent)).toEqual(["AMAnh MinhKế toán"]);
});

it("shows a chat as bubbles, mine on the right, with the composer", async () => {
  mocks.load.mockResolvedValue({ contacts: [], others: [], me: "me", canAi: false, surface: "customer",
    thread: { kind: "conversation", id: "c1", title: "Chị Lan", subtitle: "Chủ doanh nghiệp", contact: null, group: false, names: {},
      messages: [{ id: "m1", body: "Chào chị", sender_auth_user_id: "me", created_at: "2026-10-30T01:00:00Z" }, { id: "m2", body: "Chào em", sender_auth_user_id: "lan", created_at: "2026-10-30T01:01:00Z" }] } });
  const { container } = render(await MessagingWorkspace({ surface: "customer", searchParams: Promise.resolve({ conversation: "c1" }) }));
  expect(screen.getByRole("heading", { name: "Tin nhắn" })).toBeInTheDocument();
  expect([...container.querySelectorAll(".chat-bubble-row")].map((row) => [row.className, row.querySelector(".chat-bubble")?.textContent]))
    .toEqual([["chat-bubble-row mine", "Chào chị"], ["chat-bubble-row theirs", "Chào em"]]);
  expect(screen.getByLabelText("Nội dung tin nhắn")).toBeInTheDocument();
  expect(container.querySelector("input[name=conversation_id]")).toHaveValue("c1");
  expect(screen.queryByText("Trợ lý AI")).not.toBeInTheDocument();
});
