import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dock: vi.fn(), chat: vi.fn(), send: vi.fn(), path: "/admin/orders", wide: true }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path }));
vi.mock("@/modules/messaging/dock-actions", () => ({ loadDockAction: mocks.dock, loadChatAction: mocks.chat, sendChatAction: mocks.send }));
vi.mock("@/modules/ai/actions", () => ({ loadAiChatAction: vi.fn(async () => []), askAiAction: vi.fn(), newAiChatAction: vi.fn(), decideAiProposalAction: vi.fn() }));
vi.mock("@/modules/messaging/actions", () => ({ sendMessageAction: vi.fn(), sendDirectMessageAction: vi.fn() }));
vi.mock("./messaging-controls", async (original) => ({ ...(await original<typeof import("./messaging-controls")>()), useMessageInserts: () => undefined }));

import { ChatDock } from "./chat-dock";

const lan = { auth_user_id: "a1b2c3d4-0000-4000-8000-000000000001", contact_kind: "EMPLOYEE", display_name: "Chị Lan", subtitle: "Kế toán", customer_id: null,
  conversation_id: null, last_message_preview: null, last_message_at: null, unread_count: 1 };
const minh = { ...lan, auth_user_id: "a1b2c3d4-0000-4000-8000-000000000002", display_name: "Anh Minh", unread_count: 0 };

beforeEach(() => {
  vi.clearAllMocks(); mocks.path = "/admin/orders"; mocks.wide = true;
  window.matchMedia = vi.fn(() => ({ matches: mocks.wide, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never;
  mocks.dock.mockResolvedValue({ contacts: [lan, minh], canAi: true });
  mocks.chat.mockResolvedValue({ conversationId: null, messages: [], me: "me" });
});
afterEach(cleanup);

it("shows the contacts on the right with the search box under the list, and filters by name", async () => {
  render(<ChatDock surface="admin" />);
  const dock = await screen.findByRole("complementary", { name: "Người liên hệ" });
  await within(dock).findByText("Chị Lan");
  const children = [...dock.children].map((child) => child.tagName);
  expect(children.indexOf("UL")).toBeLessThan(children.indexOf("INPUT"));
  expect(within(dock).getByText("Trợ lý AI")).toBeInTheDocument();
  expect(within(dock).getByLabelText("1 tin chưa đọc")).toBeInTheDocument();
  fireEvent.change(within(dock).getByPlaceholderText("Tìm người…"), { target: { value: "minh" } });
  expect(within(dock).queryByText("Chị Lan")).not.toBeInTheDocument();
  expect(within(dock).getByText("Anh Minh")).toBeInTheDocument();
});

it("opens a small chat window and sends the first message to the contact", async () => {
  mocks.send.mockResolvedValue({ ok: true, conversationId: "c1" });
  render(<ChatDock surface="admin" />);
  fireEvent.click(await screen.findByRole("button", { name: /Chị Lan/ }));
  const window = await screen.findByRole("region", { name: "Chat với Chị Lan" });
  await within(window).findByText("Gửi tin nhắn đầu tiên cho Chị Lan.");
  fireEvent.change(within(window).getByLabelText("Nội dung tin nhắn"), { target: { value: "Chào chị" } });
  await act(async () => { fireEvent.click(within(window).getByRole("button", { name: "Gửi" })); });
  await waitFor(() => expect(mocks.send).toHaveBeenCalledWith("admin", { conversationId: null, contactId: lan.auth_user_id, contactCustomerId: null }, "Chào chị", expect.any(String)));
});

it("stays out of the Tin nhắn page and of narrow screens", async () => {
  mocks.path = "/admin/messages";
  const { container, unmount } = render(<ChatDock surface="admin" />);
  expect(container).toBeEmptyDOMElement();
  unmount();
  mocks.path = "/admin"; mocks.wide = false;
  expect(render(<ChatDock surface="admin" />).container).toBeEmptyDOMElement();
  expect(mocks.dock).not.toHaveBeenCalled();
});
