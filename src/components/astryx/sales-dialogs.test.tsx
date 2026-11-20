import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AxCancelDocumentDialog, AxDeleteOrderDialog } from "./sales-dialogs";

beforeAll(() => {
  // jsdom chưa có <dialog>.showModal / close.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.show ??= function show(this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

describe("hộp thoại Astryx của đơn bán", () => {
  it("Hủy đơn mở hộp thoại có ghi chú và ô xác nhận giữ lịch sử, gửi đúng entityId và operationId", () => {
    render(<AxCancelDocumentDialog entityId="o1" operationId="op-1" state="CONFIRMED" label="Hủy đơn" action={vi.fn()} note="Hủy cả phiếu giao PG-0118." />);
    fireEvent.click(screen.getByRole("button", { name: "Hủy đơn" }));
    expect(screen.getByText(/Tôi xác nhận hủy chứng từ này/)).toBeInTheDocument();
    expect(screen.getByText("Hủy cả phiếu giao PG-0118.")).toBeInTheDocument();
    expect((document.querySelector('input[name="entityId"]') as HTMLInputElement).value).toBe("o1");
    expect((document.querySelector('input[name="operationId"]') as HTMLInputElement).value).toBe("op-1");
  });

  it("Xóa đơn bán chỉ cho gửi khi có lý do và gõ đúng mã đơn", () => {
    render(<AxDeleteOrderDialog entityId="o1" operationId="op-2" orderNumber="SO-0231" action={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Xóa đơn bán" }));
    const submit = screen.getAllByRole("button", { name: "Xóa đơn bán" }).find((button) => (button as HTMLButtonElement).type === "submit") as HTMLButtonElement;
    expect(submit).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(screen.getByLabelText("Lý do xóa"), { target: { value: "Nhập nhầm" } });
    fireEvent.change(screen.getByLabelText(/Gõ mã đơn SO-0231/), { target: { value: "so-0231" } });
    expect(submit).not.toHaveAttribute("aria-disabled");
  });
});
