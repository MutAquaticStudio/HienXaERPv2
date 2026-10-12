import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OpenReturnCaseForm } from "./open-return-case-form";

const fixture = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("@/modules/delivery/actions", () => ({ openReturnCaseAction: fixture.action }));
const props = {
  deliveryId: "10000000-0000-4000-8000-000000000001",
  operationId: "10000000-0000-4000-8000-000000000003",
  lines: [{ id: "line-1", label: "Dòng 1" }, { id: "line-2", label: "Dòng 2" }],
};
afterEach(cleanup);
beforeEach(() => fixture.action.mockReset());
function fill() {
  fireEvent.change(screen.getByLabelText("Dòng giao cần xử lý"), { target: { value: "line-2" } });
  fireEvent.change(screen.getByLabelText("Vấn đề"), { target: { value: "CUSTOMER_RETURN" } });
  fireEvent.change(screen.getByLabelText("Số lượng theo đơn vị cơ sở"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Lý do"), { target: { value: "QA return reason" } });
}
function submit() {
  fireEvent.submit(screen.getByRole("button", { name: "Mở hồ sơ xử lý" }).closest("form")!);
}

it("keeps every draft field and the operation identifier after rejection and retry", async () => {
  fixture.action.mockResolvedValue({ success: false, error: "Số lượng vượt phần còn lại của nguồn." });
  render(<OpenReturnCaseForm {...props} />);
  fill(); submit();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Số lượng vượt"));
  expect(screen.getByLabelText("Dòng giao cần xử lý")).toHaveValue("line-2");
  expect(screen.getByLabelText("Vấn đề")).toHaveValue("CUSTOMER_RETURN");
  expect(screen.getByLabelText("Số lượng theo đơn vị cơ sở")).toHaveValue("3");
  expect(screen.getByLabelText("Lý do")).toHaveValue("QA return reason");
  fireEvent.change(screen.getByLabelText("Số lượng theo đơn vị cơ sở"), { target: { value: "1" } });
  submit();
  await waitFor(() => expect(fixture.action).toHaveBeenCalledTimes(2));
  expect(fixture.action.mock.calls.map((call) => call[1].get("operationId"))).toEqual([props.operationId, props.operationId]);
  expect(fixture.action.mock.calls.map((call) => call[1].get("verificationLineId"))).toEqual(["line-2", "line-2"]);
  expect(fixture.action.mock.calls.map((call) => call[1].get("caseKind"))).toEqual(["CUSTOMER_RETURN", "CUSTOMER_RETURN"]);
  expect(fixture.action.mock.calls[1][1].get("quantity")).toBe("1");
});

it("clears the completed draft and creates a new intent only after success", async () => {
  fixture.action.mockResolvedValue({ success: true, error: null });
  render(<OpenReturnCaseForm {...props} />);
  fill(); submit();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã mở hồ sơ"));
  expect(screen.getByLabelText("Số lượng theo đơn vị cơ sở")).toHaveValue("");
  expect(screen.getByLabelText("Lý do")).toHaveValue("");
  expect(screen.getByLabelText("Vấn đề")).toHaveValue("TRANSIT_REMAINDER");
  expect(screen.getByLabelText("Dòng giao cần xử lý")).toHaveValue("line-2");
  const data = fixture.action.mock.calls[0][1] as FormData;
  expect(data.get("operationId")).toBe(props.operationId);
  expect(document.querySelector<HTMLInputElement>('input[name="operationId"]')?.value).not.toBe(props.operationId);
});

it("disables submission while pending and retains inputs when that request fails", async () => {
  let finish!: (state: { success: boolean; error: string | null }) => void;
  fixture.action.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  render(<OpenReturnCaseForm {...props} />);
  fill(); submit();
  await waitFor(() => expect(screen.getByRole("button", { name: "Đang mở hồ sơ..." })).toBeDisabled());
  expect(screen.getByLabelText("Số lượng theo đơn vị cơ sở")).toBeDisabled();
  expect(fixture.action).toHaveBeenCalledTimes(1);
  await act(async () => finish({ success: false, error: "Không thể lưu." }));
  expect(screen.getByLabelText("Số lượng theo đơn vị cơ sở")).toHaveValue("3");
  expect(screen.getByRole("button", { name: "Mở hồ sơ xử lý" })).toBeEnabled();
});
