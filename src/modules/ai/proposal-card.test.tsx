import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock("@/modules/ai/actions", () => ({ decideAiProposalAction: m.decide }));
import { AiProposalCardView } from "./proposal-card";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const proposal = { id: "11111111-1111-4111-8111-111111111111", title: "Gán vật tư cho nhà cung cấp", body: "Gán các vật tư sau cho nhà cung cấp tương ứng.", linkPath: "/admin/products", createdAt: "05/11/2026 12:14" };

it("D66: a manager reads the proposal in the chat, opens its screen, and marks it done", async () => {
  const onDecided = vi.fn();
  m.decide.mockResolvedValue({ ok: true, message: "Đã đánh dấu đã làm." });
  render(<AiProposalCardView proposal={proposal} canDecide onDecided={onDecided} />);
  expect(screen.getByRole("link", { name: "Mở màn hình thực hiện" })).toHaveAttribute("href", "/admin/products");
  fireEvent.click(screen.getByRole("button", { name: "Đã làm" }));
  await waitFor(() => expect(onDecided).toHaveBeenCalledWith(proposal.id));
  expect(m.decide).toHaveBeenCalledWith({ proposalId: proposal.id, decision: "DONE" });
});

it("D66: a refusal stays on the card; a person who may not decide only sees the link; a long body is folded", async () => {
  m.decide.mockResolvedValue({ ok: false, message: "Bạn không có quyền duyệt đề xuất này." });
  const onDecided = vi.fn();
  render(<AiProposalCardView proposal={{ ...proposal, body: "x".repeat(400) }} canDecide onDecided={onDecided} />);
  fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền");
  expect(onDecided).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Xem đầy đủ" }));
  expect(screen.getByRole("button", { name: "Thu gọn" })).toHaveAttribute("aria-expanded", "true");
  cleanup();
  render(<AiProposalCardView proposal={proposal} canDecide={false} onDecided={onDecided} />);
  expect(screen.queryByRole("button", { name: "Đã làm" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mở màn hình thực hiện" })).toBeInTheDocument();
});
