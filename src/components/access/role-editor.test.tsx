import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/lib/access/role-actions", () => ({ saveCustomRoleAction: m.save }));

import { RoleEditorButton, type EditorPermission } from "./role-editor";

const permissions: EditorPermission[] = [
  { code: "inventory.read", label: "Xem tồn kho", granted: true },
  { code: "inventory.count", label: "Kiểm kho", granted: true },
  { code: "finance.payment.post", label: "Ghi thu chi", granted: false },
];
beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ status: "SUCCESS", roleId: "r1", message: "Đã tạo vai trò." }); });
afterEach(cleanup);

it("creates a role from permissions ticked by group, never ones the owner lacks", async () => {
  render(<RoleEditorButton label="Tạo vai trò" permissions={permissions} />);
  fireEvent.click(screen.getByRole("button", { name: "Tạo vai trò" }));
  const dialog = screen.getByRole("dialog", { name: "Tạo vai trò" });
  expect(within(dialog).getByLabelText("Ghi thu chi")).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Tên vai trò *"), { target: { value: "Thủ kho ca tối" } });
  fireEvent.click(within(dialog).getByLabelText("Kho hàng"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Tạo vai trò" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ roleId: null, name: "Thủ kho ca tối", permissions: ["inventory.count", "inventory.read"], expected: null, active: true })));
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
});

it("warns when a role in use is edited and shows preset roles read-only", async () => {
  render(<RoleEditorButton label="Sửa" permissions={permissions} role={{ id: "r1", name: "Thủ kho", permissions: ["inventory.read"], active: true, assigned: 3, editable: true }} />);
  fireEvent.click(screen.getByRole("button", { name: "Sửa" }));
  expect(screen.getByRole("note")).toHaveTextContent("3 nhân viên");
  expect(screen.queryByLabelText("Ngừng dùng vai trò này")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Kiểm kho"));
  fireEvent.click(screen.getByRole("button", { name: "Lưu vai trò" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ roleId: "r1", permissions: ["inventory.count", "inventory.read"], expected: ["inventory.read"] })));
  cleanup();
  render(<RoleEditorButton label="Xem" permissions={permissions} role={{ id: "p1", name: "Thủ kho mẫu", permissions: ["inventory.read"], active: true, assigned: 0, editable: false }} />);
  fireEvent.click(screen.getByRole("button", { name: "Xem" }));
  expect(screen.getByRole("dialog", { name: "Vai trò · Thủ kho mẫu" })).toHaveTextContent("Xem tồn kho");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Lưu/ })).not.toBeInTheDocument();
});

it("retries an unknown outcome with the same command", async () => {
  m.save.mockResolvedValueOnce({ status: "UNKNOWN", message: "Chưa xác định được kết quả." });
  render(<RoleEditorButton label="Tạo vai trò" permissions={permissions} />);
  fireEvent.click(screen.getByRole("button", { name: "Tạo vai trò" }));
  fireEvent.change(screen.getByLabelText("Tên vai trò *"), { target: { value: "Thủ kho" } });
  fireEvent.click(screen.getByLabelText("Xem tồn kho"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Tạo vai trò" }));
  fireEvent.click(await screen.findByRole("button", { name: "Lưu lại đúng thao tác" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
  expect(m.save.mock.calls[1][0].operationId).toBe(m.save.mock.calls[0][0].operationId);
});
