import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { Dialog } from "./dialog";

afterEach(cleanup);

function Page({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return <form aria-label="Đơn đang soạn">
    <button type="button" onClick={() => setOpen(true)}>Mở</button>
    {open && <Dialog title="Thêm khách hàng" eyebrow="Tạo nhanh" description="Đơn đang soạn được giữ nguyên." initialFocusId="dialog-code"
      onClose={() => { onClose(); setOpen(false); }}>
      <form aria-label="Tạo khách"><label htmlFor="dialog-code">Mã</label><input id="dialog-code" />
        <input aria-label="Ô có danh sách" onKeyDown={(event) => { if (event.key === "Escape") event.preventDefault(); }} /></form>
    </Dialog>}
  </form>;
}

it("renders outside the page form, focuses the first field and closes on Escape", () => {
  const onClose = vi.fn();
  render(<Page onClose={onClose} />);
  const dialog = screen.getByRole("dialog", { name: "Thêm khách hàng" });
  expect(dialog.closest("form[aria-label='Đơn đang soạn']")).toBeNull();
  expect(screen.getByRole("form", { name: "Đơn đang soạn" }).parentElement).toHaveProperty("inert", true);
  expect(screen.getByLabelText("Mã")).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("form", { name: "Đơn đang soạn" }).parentElement?.inert).toBeFalsy();
});

it("keeps the popup open when a control inside already used Escape", () => {
  const onClose = vi.fn();
  render(<Page onClose={onClose} />);
  fireEvent.keyDown(screen.getByLabelText("Ô có danh sách"), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(onClose).toHaveBeenCalledOnce();
});
