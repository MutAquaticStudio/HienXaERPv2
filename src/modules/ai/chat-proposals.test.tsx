import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/modules/ai/actions", () => ({ askAiAction: vi.fn(), listAiProposalsAction: m.list, newAiChatAction: vi.fn(), decideAiProposalAction: vi.fn() }));
vi.mock("@/modules/ai/agent/actions", () => ({ listAiActionsAction: vi.fn(async () => []) }));
vi.mock("@/modules/ai/agent/action-card", () => ({ AiActionCardView: () => null }));
vi.mock("@/components/messaging/messaging-controls", () => ({ ScrollToEnd: () => null }));
import { AiChat } from "./chat";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const proposal = (n: number) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, title: `Đề xuất ${n}`, body: "Nội dung", linkPath: null, createdAt: "05/11/2026 12:14" });

it("D66: proposals waiting for a manager are cards inside the chat; three show first, the rest open with Xem thêm", async () => {
  m.list.mockResolvedValue({ canDecide: true, proposals: [1, 2, 3, 4, 5].map(proposal) });
  render(<AiChat initialTurns={[]} />);
  const list = await screen.findByLabelText("Đề xuất chờ duyệt");
  await waitFor(() => expect(within(list).getAllByRole("article")).toHaveLength(3));
  fireEvent.click(within(list).getByRole("button", { name: "Xem thêm 2 đề xuất" }));
  expect(within(list).getAllByRole("article")).toHaveLength(5);
  expect(within(list).getAllByRole("button", { name: "Đã làm" })).toHaveLength(5);
});

it("D66: with no proposal waiting the chat shows no proposal list", async () => {
  m.list.mockResolvedValue({ canDecide: false, proposals: [] });
  render(<AiChat initialTurns={[]} />);
  await waitFor(() => expect(m.list).toHaveBeenCalled());
  expect(screen.queryByLabelText("Đề xuất chờ duyệt")).not.toBeInTheDocument();
});
