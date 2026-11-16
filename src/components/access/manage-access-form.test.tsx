import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({pending:false,action:vi.fn()}));
vi.mock("react",async()=>({...await vi.importActual<typeof import("react")>("react"),useActionState:()=>[undefined,m.action,m.pending]}));
vi.mock("@/lib/auth/actions",()=>({assignRoleAction:vi.fn(),reactivateAccessAction:vi.fn(),revokeAccessAction:vi.fn(),setExplicitPermissionsAction:vi.fn(),removeEmployeeAction:vi.fn(),restoreEmployeeAction:vi.fn()}));
import{ExplicitPermissionForm,ManageAccessForm}from"./manage-access-form";
import{foldSearchText}from"./presentation";
const props={employeeId:"qa-employee",branches:[{id:"qa-branch",name:"QA chi nhánh"}],roles:[{id:"qa-worker",name:"Thợ"}],operationId:"11111111-1111-4111-8111-111111111111"};
afterEach(()=>{cleanup();m.pending=false;});
it("preserves the same intent across rerender and response loss until fields change",()=>{const{container,rerender}=render(<ManageAccessForm {...props}/>);expect(container.querySelector<HTMLInputElement>('[name="operationId"]')?.value).toBe(props.operationId);rerender(<ManageAccessForm {...props} operationId="22222222-2222-4222-8222-222222222222"/>);expect(container.querySelector<HTMLInputElement>('[name="operationId"]')?.value).toBe(props.operationId);});
it("starts a new intent only when the assignment fields change",()=>{const{container}=render(<ManageAccessForm {...props}/>);fireEvent.change(screen.getByLabelText("Vai trò"),{target:{value:"qa-worker"}});const id=container.querySelector<HTMLInputElement>('[name="operationId"]')?.value;expect(id).not.toBe(props.operationId);expect(id).toMatch(/^[a-f0-9-]{36}$/);fireEvent.change(screen.getByLabelText("Chi nhánh"),{target:{value:"qa-branch"}});expect(container.querySelector<HTMLInputElement>('[name="operationId"]')?.value).not.toBe(id);});
it("no longer asks for a reason (FB7)",()=>{render(<ManageAccessForm {...props}/>);expect(screen.queryByLabelText(/Lý do/)).not.toBeInTheDocument();expect(document.querySelector('[name="reason"]')).toBeNull();});
it("disables sending while the same command is pending",()=>{m.pending=true;render(<ManageAccessForm {...props}/>);expect(screen.getByRole("button",{name:"Lưu vai trò"})).toBeDisabled();});

const roles=[{id:"r-sales",name:"Sales",label:"Bán hàng"},{id:"r-kho",name:"Warehouse",label:"Nhân viên kho"}];
const assignments=[{branchId:"other",branchName:"Kho Bình Dương",roleId:"r-buy",roleLabel:"Mua hàng",active:true},{branchId:"qa-branch",branchName:"QA chi nhánh",roleId:"r-sales",roleLabel:"Bán hàng",active:true}];
it("shows the roles held per branch and starts from the current role, which it does not save again",()=>{
  render(<ManageAccessForm {...props} roles={roles} assignments={assignments}/>);
  const held=screen.getByRole("region",{name:"Vai trò hiện tại"});
  expect(within(held).getAllByRole("term").map((term)=>term.textContent)).toEqual(["QA chi nhánh","Kho Bình Dương"]);
  expect(held).toHaveTextContent("Bán hàng");expect(held).toHaveTextContent("Mua hàng");
  const role=screen.getByLabelText<HTMLSelectElement>("Vai trò");
  expect(role.value).toBe("r-sales");
  expect(screen.getByRole("button",{name:"Lưu vai trò"})).toBeDisabled();
  expect(role).toHaveAccessibleDescription("Đang là vai trò hiện tại. Chọn vai trò khác để đổi.");
  fireEvent.change(role,{target:{value:"r-kho"}});
  expect(screen.getByRole("button",{name:"Lưu vai trò"})).toBeEnabled();
});
it("offers the previous role again after a revoke and asks for a choice when the person has none",()=>{
  render(<ManageAccessForm {...props} roles={roles} assignments={[{...assignments[1],active:false}]}/>);
  expect(screen.getByLabelText<HTMLSelectElement>("Vai trò").value).toBe("r-sales");
  expect(screen.getByRole("region",{name:"Vai trò hiện tại"})).toHaveTextContent("Đã thu hồi");
  expect(screen.getByRole("button",{name:"Lưu vai trò"})).toBeEnabled();
  cleanup();
  render(<ManageAccessForm {...props} roles={roles}/>);
  expect(screen.getByLabelText<HTMLSelectElement>("Vai trò").value).toBe("");
  expect(screen.getByRole("region",{name:"Vai trò hiện tại"})).toHaveTextContent("Chưa có vai trò ở chi nhánh nào.");
});

const permissions=[
  {code:"orders.create",name:"Tạo đơn bán"},{code:"orders.confirm",name:"Xác nhận đơn bán"},
  {code:"delivery.create",name:"Tạo phiếu giao"},{code:"finance.ar.read",name:"Xem công nợ phải thu"},
  {code:"work.field_dispatch",name:"Điều phối hiện trường (thợ chính)"},{code:"attendance.read",name:"Xem chấm công"},
];
const explicit=(extra={})=>render(<ExplicitPermissionForm employeeId="e1" branchId="b1" permissions={permissions} selected={["finance.ar.read","delivery.create"]}
  inherited={[{code:"orders.read",name:"Xem đơn bán"},{code:"delivery.read",name:"Xem giao hàng"}]} roleName="Nhân viên kho" {...extra}/>);
const sent=()=>[...new FormData(document.querySelector("form")!).getAll("permissionCode")];
it("groups permissions like the menu, one per line, with a count per group and what the role already gives locked",()=>{
  explicit();
  const groups=screen.getAllByRole("group");
  expect(groups.map((group)=>group.querySelector("legend")!.textContent)).toEqual(["Bán hàngđã chọn 0/2","Giao hàngđã chọn 1/1","Tài chínhđã chọn 1/1","Nhân côngđã chọn 0/2"]);
  expect(screen.getByText(/Đã chọn/)).toHaveTextContent("Đã chọn 2 quyền cộng thêm · 2 quyền có sẵn từ vai trò Nhân viên kho");
  const fromRole=screen.getByLabelText(/Xem đơn bán/);
  expect(fromRole).toBeChecked();expect(fromRole).toBeDisabled();expect(fromRole).not.toHaveAttribute("name");
  expect(fromRole).toHaveAccessibleDescription("Đã có từ vai trò");
  // The lead worker's note sits under its own box, not in the middle of the list.
  expect(screen.getByLabelText(/Điều phối hiện trường/)).toHaveAccessibleDescription(/Mở tab Điều phối ở cổng thợ/);
  expect(sent()).toEqual(["delivery.create","finance.ar.read"]);
  fireEvent.click(screen.getByLabelText("Tạo đơn bán"));
  expect(groups[0].querySelector("legend")).toHaveTextContent("đã chọn 1/2");
  expect(sent()).toEqual(["orders.create","delivery.create","finance.ar.read"]);
});
it("filters by label without Vietnamese marks and never drops a ticked box it hides",()=>{
  explicit();
  fireEvent.change(screen.getByLabelText("Tìm quyền"),{target:{value:"don ban"}});
  expect(screen.getByLabelText("Tạo đơn bán")).toBeVisible();
  expect(screen.getByLabelText("Tạo phiếu giao")).not.toBeVisible();
  expect(screen.getAllByRole("group").map((group)=>group.querySelector("legend span")!.textContent)).toEqual(["Bán hàng"]);
  expect(sent()).toEqual(["delivery.create","finance.ar.read"]);
  // A group name finds the whole group.
  fireEvent.change(screen.getByLabelText("Tìm quyền"),{target:{value:"nhân công"}});
  expect(screen.getByLabelText("Xem chấm công")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Tìm quyền"),{target:{value:"không có"}});
  expect(screen.getByText(/Không có quyền nào khớp/)).toHaveTextContent("Không có quyền nào khớp “không có”.");
  fireEvent.click(screen.getByRole("button",{name:"Xóa tìm kiếm"}));
  expect(screen.getByLabelText<HTMLInputElement>("Tìm quyền").value).toBe("");
  expect(screen.getAllByRole("group")).toHaveLength(4);
  expect(foldSearchText("  Điều PHỐI  hiện trường ")).toBe("dieu phoi hien truong");
});
it("says so when nothing can be added",()=>{
  explicit({permissions:[],selected:[]});
  expect(screen.getByText("Không có quyền nào trong phạm vi của bạn để cấp thêm.")).toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Lưu quyền bổ sung"})).toBeEnabled();
});
