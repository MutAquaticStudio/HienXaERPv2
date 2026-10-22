import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ save: vi.fn(), lookup: vi.fn(), draft: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/lib/core/command-outcome-actions", () => ({ saveCommandDraftAction: m.save, lookupCommandOutcomeAction: m.lookup, getCommandDraftAction: m.draft }));
import { ReliableCommandForm } from "./reliable-command-form";

const first = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  m.save.mockResolvedValue({ status: "SUCCESS", resultId: "draft", message: "ok" });
});
afterEach(cleanup);

function setup(action: ReturnType<typeof vi.fn>, onNew = vi.fn()) {
  render(<ReliableCommandForm action={action} command="post_payment" scope="s" operationId={first} onNew={onNew}>
    <label htmlFor="amount">Số tiền</label><input id="amount" name="amount" defaultValue="" />
    <label htmlFor="note">Ghi chú</label><input id="note" name="note" defaultValue="" />
    <button type="submit">Lưu</button>
  </ReliableCommandForm>);
  return onNew;
}
const submit = () => act(async () => { fireEvent.submit(screen.getByRole("button", { name: "Lưu" }).closest("form")!); });

it("keeps what was typed after a refusal, marks the field and sends the fix as a new operation (FB7)", async () => {
  const action = vi.fn().mockResolvedValueOnce({ status: "FAILED", message: "Số tiền phải lớn hơn 0.", field: "amount" })
    .mockResolvedValueOnce({ status: "SUCCESS", resultId: "PT-1", message: "Đã ghi nhận." });
  setup(action);
  await waitFor(() => expect(screen.getByLabelText("Số tiền")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText("Ghi chú"), { target: { value: "Thu tiền mặt" } });
  await submit();
  expect(await screen.findByRole("alert")).toHaveTextContent("Số tiền phải lớn hơn 0.");
  expect(screen.queryByRole("button", { name: "Bắt đầu thao tác mới" })).not.toBeInTheDocument();
  const amount = screen.getByLabelText("Số tiền");
  expect(amount).toBeEnabled();
  expect(amount).toHaveAttribute("aria-invalid", "true");
  expect(amount).toHaveFocus();
  expect(screen.getByLabelText("Ghi chú")).toHaveValue("Thu tiền mặt");
  fireEvent.change(amount, { target: { value: "500000" } });
  await submit();
  await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  const ids = action.mock.calls.map((call) => (call[0] as FormData).get("operationId"));
  expect(ids[0]).toBe(first);
  expect(ids[1]).not.toBe(first);
  expect((action.mock.calls[1][0] as FormData).get("amount")).toBe("500000");
});

it("starts the next entry by itself once saved", async () => {
  const action = vi.fn().mockResolvedValue({ status: "SUCCESS", resultId: "PT-2", message: "Đã ghi nhận." });
  const onNew = setup(action);
  await waitFor(() => expect(screen.getByLabelText("Số tiền")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Số tiền"), { target: { value: "700000" } });
  await submit();
  expect(await screen.findByRole("status")).toHaveTextContent("Đã ghi nhận.");
  expect(screen.getByLabelText("Số tiền")).toHaveValue("");
  expect(screen.getByLabelText("Số tiền")).toBeEnabled();
  expect(onNew).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Bắt đầu thao tác mới" })).not.toBeInTheDocument();
});

it("keeps the same operation to look up or retry when the outcome is unknown", async () => {
  const action = vi.fn().mockResolvedValue({ status: "UNKNOWN", message: "Chưa xác định được kết quả." });
  setup(action);
  await waitFor(() => expect(screen.getByLabelText("Số tiền")).toBeEnabled());
  await submit();
  expect(await screen.findByRole("button", { name: "Tra cứu kết quả" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Thử lại cùng thao tác" })).toBeInTheDocument();
  expect(screen.getByLabelText("Số tiền")).toBeDisabled();
  expect(localStorage.getItem("hx-intent-v1:s:post_payment")).toBe(first);
});
