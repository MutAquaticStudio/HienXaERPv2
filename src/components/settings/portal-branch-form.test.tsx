import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn(async () => ({ status: "SUCCESS", message: "Đã lưu. Khách tự đăng ký từ bây giờ vào chi nhánh này." })));
vi.mock("@/modules/settings/portal-branch-actions", () => ({ setPortalBranchAction: save }));
import { PortalBranchForm } from "./portal-branch-form";

const branches = [{ id: "11111111-1111-4111-8111-111111111111", name: "Hiền Xa" }, { id: "22222222-2222-4222-8222-222222222222", name: "Hiền Xa 2" }];

it("warns while no branch receives self-registered customers, saves the chosen one once (D58)", async () => {
  render(<PortalBranchForm current={null} branches={branches} />);
  expect(screen.getByText(/khách chưa tự đăng ký được/)).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "Lưu chi nhánh nhận khách" });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Chi nhánh nhận khách tự đăng ký"), { target: { value: branches[0].id } });
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByText(/^Đã lưu\./)).toHaveAttribute("role", "status"));
  expect(save).toHaveBeenCalledWith({ branchId: branches[0].id, operationId: expect.any(String) });
});
