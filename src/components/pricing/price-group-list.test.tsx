import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/pricing/price-group-actions", () => ({ savePriceGroupAction: m.save }));
import { PriceGroupList } from "./price-group-list";

beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ success: true, message: "Đã lưu nhóm giá Khách sỉ." }); });
afterEach(cleanup);
const groups = [{ code: "SI", name: "Khách sỉ", active: true, customers: 12 }, { code: "DAILY", name: "Đại lý", active: false, customers: 0 }];

it("lists groups with their customers and creates one in a popup", async () => {
  render(<PriceGroupList groups={groups} canManage />);
  expect(screen.getByText("Khách sỉ").closest("tr")).toHaveTextContent("12");
  expect(screen.getByText("Đã ngừng")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "+ Nhóm giá" }));
  const dialog = screen.getByRole("dialog", { name: "Thêm nhóm giá khách" });
  fireEvent.change(within(dialog).getByLabelText("Mã nhóm *"), { target: { value: "dai_ly" } });
  fireEvent.change(within(dialog).getByLabelText("Tên nhóm *"), { target: { value: "Đại lý cấp 1" } });
  fireEvent.change(within(dialog).getByLabelText("Lý do thay đổi *"), { target: { value: "Thêm nhóm đại lý" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Tạo nhóm giá" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ code: "dai_ly", name: "Đại lý cấp 1", active: true, reason: "Thêm nhóm đại lý" })));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("status")).toHaveTextContent("Đã lưu nhóm giá Khách sỉ.");
});

it("keeps the code fixed when renaming or stopping a group", async () => {
  render(<PriceGroupList groups={groups} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Sửa nhóm Khách sỉ" }));
  const dialog = screen.getByRole("dialog", { name: "Nhóm giá · Khách sỉ" });
  expect(within(dialog).getByLabelText("Mã nhóm *")).toHaveAttribute("readonly");
  fireEvent.click(within(dialog).getByLabelText("Đang dùng"));
  fireEvent.change(within(dialog).getByLabelText("Lý do thay đổi *"), { target: { value: "Tạm ngừng" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Lưu nhóm giá" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ code: "SI", active: false })));
});

it("is read-only without the pricing manage right", () => {
  render(<PriceGroupList groups={groups} canManage={false} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
