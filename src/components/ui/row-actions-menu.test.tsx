import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FormDialog } from "./form-dialog";
import { RowActionsMenu, RowActionsSeparator } from "./row-actions-menu";

afterEach(cleanup);

const menu = () => <div>
  <RowActionsMenu accessibleLabel="Thêm thao tác · Anh Nam" triggerData={{ "employee-id": "e1", action: "more" }}>
    <FormDialog label="Link kích hoạt" title="Link kích hoạt · Anh Nam" buttonClassName="more-actions-item" triggerRole="menuitem" triggerData={{ action: "activation" }}><p>Nội dung link</p></FormDialog>
    <RowActionsSeparator />
    <FormDialog label="Xóa" title="Xóa nhân viên · Anh Nam" buttonClassName="more-actions-item more-actions-danger" triggerRole="menuitem" triggerData={{ action: "remove" }}>
      <label>Ghi chú<input /></label></FormDialog>
  </RowActionsMenu>
  <button type="button">Sau menu</button>
</div>;

it("keeps the items hidden until 'Thêm' opens the menu, then moves through them with the arrow keys", () => {
  render(menu());
  const trigger = screen.getByRole("button", { name: "Thêm thao tác · Anh Nam" });
  expect(trigger).toHaveTextContent("Thêm");
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  expect(trigger).toHaveAttribute("data-action", "more");
  expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();

  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const list = screen.getByRole("menu", { name: "Thêm thao tác · Anh Nam" });
  expect(within(list).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Link kích hoạt", "Xóa"]);
  expect(within(list).getByRole("separator")).toBeInTheDocument();
  expect(within(list).getByRole("menuitem", { name: "Xóa" })).toHaveClass("more-actions-danger");
  expect(within(list).getByRole("menuitem", { name: "Link kích hoạt" })).toHaveFocus();

  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(within(list).getByRole("menuitem", { name: "Xóa" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(within(list).getByRole("menuitem", { name: "Link kích hoạt" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(within(list).getByRole("menuitem", { name: "Xóa" })).toHaveFocus();

  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it("opens an item's popup, closes the list, and lets the popup take its own keys", () => {
  render(menu());
  const trigger = screen.getByRole("button", { name: "Thêm thao tác · Anh Nam" });
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("menuitem", { name: "Xóa" }));
  const dialog = screen.getByRole("dialog", { name: "Xóa nhân viên · Anh Nam" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  // Keys typed in the popup are not menu keys, even though the popup belongs to the list in the React tree.
  const note = within(dialog).getByLabelText("Ghi chú");
  note.focus();
  fireEvent.keyDown(note, { key: "ArrowDown" });
  expect(note).toHaveFocus();
  fireEvent.keyDown(note, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("closes on a click outside and on Tab, without keeping a stale list open", () => {
  render(menu());
  const trigger = screen.getByRole("button", { name: "Thêm thao tác · Anh Nam" });
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole("button", { name: "Sau menu" }));
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Link kích hoạt" }), { key: "Tab" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});
