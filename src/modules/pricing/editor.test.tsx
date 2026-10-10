import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PricingRuleEditor } from "./editor";
import { savePricingRuleAction } from "./actions";
import { savePurchasePricingRuleAction } from "./purchase-actions";
vi.mock("./actions", () => ({ savePricingRuleAction: vi.fn(async () => ({ success: true, message: "Đã tạo chính sách giá." })) }));
vi.mock("./purchase-actions", () => ({ savePurchasePricingRuleAction: vi.fn(async () => ({ success: true, message: "Đã tạo giá mua." })) }));
// jsdom lacks native modal methods; real Tab/Escape/top-layer behavior is checked in Codex Browser QA.
const nativeShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const nativeClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
  Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});
afterAll(() => {
  if(nativeShowModal)Object.defineProperty(HTMLDialogElement.prototype,"showModal",nativeShowModal);else Reflect.deleteProperty(HTMLDialogElement.prototype,"showModal");
  if(nativeClose)Object.defineProperty(HTMLDialogElement.prototype,"close",nativeClose);else Reflect.deleteProperty(HTMLDialogElement.prototype,"close");
});
beforeEach(() => { vi.clearAllMocks(); vi.mocked(savePurchasePricingRuleAction).mockResolvedValue({success:true,message:"Đã tạo giá mua."}); vi.mocked(savePricingRuleAction).mockResolvedValue({success:true,message:"Đã tạo chính sách giá."}); });
afterEach(cleanup);

it("allows creating another price rule after a successful save", async () => {
  render(<PricingRuleEditor options={{ customers: [], groups: [], materials: [{ id: "material", name: "Vật tư" }], units: [{ id: "uom", name: "Bao" }] }} />);
  const button = screen.getByRole("button", { name: "Tạo chính sách giá" });
  fireEvent.submit(button.closest("form")!);
  await screen.findByText("Đã tạo chính sách giá.");
  expect(button).toBeEnabled();
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(savePricingRuleAction).toHaveBeenCalledTimes(2));
});

it("binds purchase scope and preserves exact money and retry identity", async () => {
  render(<PricingRuleEditor purchase command={{ targetId: "target", operationId: "operation" }} options={{ customers: [], groups: [], materials: [{ id: "material", name: "Vật tư" }], units: [{ id: "uom", name: "Bao" }], suppliers: [{ id: "supplier", name: "NCC QA" }] }} />);
  fireEvent.change(screen.getByLabelText("Nhà cung cấp *"), { target: { value: "supplier" } });
  fireEvent.change(screen.getByLabelText("Vật tư *"), { target: { value: "material" } });
  fireEvent.change(screen.getByLabelText("Đơn vị giá *"), { target: { value: "uom" } });
  fireEvent.change(screen.getByLabelText("Đơn giá (VND) *"), { target: { value: "9007199254740993" } });
  const button = screen.getByRole("button", { name: "Tạo chính sách giá" });
  fireEvent.submit(button.closest("form")!);
  await screen.findByText("Đã tạo giá mua.");
  const payload = vi.mocked(savePurchasePricingRuleAction).mock.calls[0][1];
  expect(payload.get("unitPriceVnd")).toBe("9007199254740993");
  expect(payload.get("operationId")).toBe("operation");
  expect(payload.get("targetId")).toBe("target");
  expect(payload.get("supplierId")).toBe("supplier");
  expect(savePricingRuleAction).not.toHaveBeenCalled();
});

it("locks replacement scope and sends optimistic version without Sales action", async () => {
  render(<PricingRuleEditor purchase purchaseRule={{ id: "old", supplier_id: "supplier", material_id: "material", purchase_uom_id: "uom", unit_cost_vnd: "9007199254740993", version: 2, source_type: "CONTRACT", effective_from: "2026-10-10T00:00:00+07:00", effective_to: null, active: true }} command={{ targetId: "new", operationId: "replacement" }} options={{ customers: [], groups: [], materials: [], units: [] }} />);
  expect(screen.getByLabelText("Đơn giá (VND) *")).toHaveValue("9007199254740993");
  expect(screen.queryByLabelText("Nhà cung cấp *")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ngừng sử dụng" })).toHaveAttribute("type", "button");
  const button = screen.getByRole("button", { name: "Tạo phiên bản mới" });
  fireEvent.submit(button.closest("form")!);
  expect(await screen.findByRole("status")).toHaveTextContent("Đã tạo giá mua.");
  const payload = vi.mocked(savePurchasePricingRuleAction).mock.calls[0][1];
  expect(payload.get("supersedesId")).toBe("old");
  expect(payload.get("expectedVersion")).toBe("2");
  expect(payload.get("supplierId")).toBeNull();
  expect(button).toBeDisabled();
  expect(savePricingRuleAction).not.toHaveBeenCalled();
});

const existing = { id:"old",supplier_id:"supplier",material_id:"material",purchase_uom_id:"uom",unit_cost_vnd:"9007199254740993",version:7,source_type:"CONTRACT",effective_from:"2026-10-10T00:00:00+07:00",effective_to:null,active:true };
function confirmation() {
  render(<PricingRuleEditor purchase purchaseRule={existing} scopeLabel="NCC QA · Vật tư · Bao" command={{targetId:"new",operationId:"stable-operation"}} options={{customers:[],groups:[],materials:[],units:[]}} />);
  fireEvent.click(screen.getByRole("button",{name:"Ngừng sử dụng"}));
}
it("opens accessible confirmation with identity, exact cost, version and consequence without a write",()=>{
  confirmation();
  expect(screen.getByRole("dialog",{name:"Xác nhận ngừng sử dụng giá"})).toBeInTheDocument();
  expect(screen.getByText("NCC QA · Vật tư · Bao")).toBeInTheDocument();
  expect(screen.getByText(/Mã quy tắc: old.*Phiên bản: 7/)).toBeInTheDocument();
  expect(screen.getByText("Giá hiện tại: 9007199254740993 VND")).toBeInTheDocument();
  expect(screen.getByText(/snapshot chứng từ đã chốt không thay đổi/)).toBeInTheDocument();
  expect(screen.getByLabelText("Lý do ngừng sử dụng *")).toHaveFocus();
  expect(savePurchasePricingRuleAction).not.toHaveBeenCalled();
});
it("cancel performs zero commands and restores focus",()=>{
  confirmation();fireEvent.click(screen.getByRole("button",{name:"Quay lại"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(savePurchasePricingRuleAction).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"Ngừng sử dụng"})).toHaveFocus();
});
it("rejects missing or whitespace reason without dispatching even with formNoValidate",()=>{
  confirmation();fireEvent.change(screen.getByLabelText("Lý do ngừng sử dụng *"),{target:{value:"   "}});
  fireEvent.click(screen.getByRole("button",{name:"Xác nhận ngừng sử dụng"}));
  expect(screen.getByRole("alert")).toHaveTextContent("Cần lý do ngừng sử dụng");
  expect(savePurchasePricingRuleAction).not.toHaveBeenCalled();
});
it("confirms exactly one deactivation without requiring creation fields",async()=>{
  confirmation();fireEvent.change(screen.getByLabelText("Lý do ngừng sử dụng *"),{target:{value:"QA ngừng giá"}});
  fireEvent.click(screen.getByRole("button",{name:"Xác nhận ngừng sử dụng"}));
  await waitFor(()=>expect(savePurchasePricingRuleAction).toHaveBeenCalledTimes(1));
  const payload=vi.mocked(savePurchasePricingRuleAction).mock.calls[0][1];
  expect(Object.fromEntries(payload)).toEqual({mode:"deactivate",supersedesId:"old",expectedVersion:"7",operationId:"stable-operation",reason:"QA ngừng giá"});
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Ngừng sử dụng"})).toBeDisabled();
  expect(screen.getByRole("status")).toHaveFocus();
  expect(savePricingRuleAction).not.toHaveBeenCalled();
});
it.each(["Không có quyền quản lý giá mua trong chi nhánh này.","Phiên bản hoặc thao tác đã thay đổi. Tải lại trước khi lưu."])("retains confirmation metadata after controlled error: %s",async message=>{
  vi.mocked(savePurchasePricingRuleAction).mockResolvedValueOnce({message});
  confirmation();fireEvent.change(screen.getByLabelText("Lý do ngừng sử dụng *"),{target:{value:"QA ngừng giá"}});
  fireEvent.click(screen.getByRole("button",{name:"Xác nhận ngừng sử dụng"}));
  await waitFor(()=>expect(screen.getAllByRole("status").every(x=>x.textContent===message)).toBe(true));
  expect(screen.getByLabelText("Lý do ngừng sử dụng *")).toHaveValue("QA ngừng giá");
  expect(screen.getByRole("button",{name:"Xác nhận ngừng sử dụng"})).toBeEnabled();
});
it("blocks a duplicate confirmation while the intended command is pending",async()=>{
  let resolve!: (value:{success:true;message:string})=>void;
  vi.mocked(savePurchasePricingRuleAction).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  confirmation();fireEvent.change(screen.getByLabelText("Lý do ngừng sử dụng *"),{target:{value:"QA ngừng giá"}});
  const form=screen.getByRole("form",{name:"Xác nhận ngừng sử dụng"});
  fireEvent.submit(form);fireEvent.submit(form);
  await waitFor(()=>expect(savePurchasePricingRuleAction).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button",{name:"Đang ngừng sử dụng..."})).toBeDisabled();
  resolve({success:true,message:"Đã ngừng giá mua."});
  await waitFor(()=>expect(screen.getAllByRole("status").every(x=>x.textContent==="Đã ngừng giá mua.")).toBe(true));
});
it("uses the same confirmed path for Sales without leaking a purchase command",async()=>{
  render(<PricingRuleEditor rule={{id:"sales-rule",scope_type:"DEFAULT",customer_id:null,material_id:"material",material_group_id:null,customer_tier_code:null,price_uom_id:"uom",unit_price_vnd:"95000",version:2,source_type:"LIST",effective_from:"2026-10-10T00:00:00+07:00",effective_to:null,active:true}} options={{customers:[],groups:[],materials:[],units:[]}}/>);
  fireEvent.click(screen.getByRole("button",{name:"Ngừng sử dụng"}));
  fireEvent.change(screen.getByLabelText("Lý do ngừng sử dụng *"),{target:{value:"QA sales reason"}});
  fireEvent.click(screen.getByRole("button",{name:"Xác nhận ngừng sử dụng"}));
  await waitFor(()=>expect(savePricingRuleAction).toHaveBeenCalledTimes(1));
  expect(vi.mocked(savePricingRuleAction).mock.calls[0][1].get("mode")).toBe("deactivate");
  expect(savePurchasePricingRuleAction).not.toHaveBeenCalled();
});

it("Escape cancels without dispatch and restores the originating focus",()=>{
 confirmation();
 fireEvent.keyDown(screen.getByLabelText("Lý do ngừng sử dụng *"),{key:"Escape"});
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Ngừng sử dụng"})).toHaveFocus();
 expect(savePurchasePricingRuleAction).not.toHaveBeenCalled();
});
it("wraps Tab and Shift-Tab at dialog boundaries without document listeners",()=>{
 confirmation();
 const first=screen.getByLabelText("Lý do ngừng sử dụng *"),last=screen.getByRole("button",{name:"Xác nhận ngừng sử dụng"});
 first.focus();fireEvent.keyDown(first,{key:"Tab",shiftKey:true});expect(last).toHaveFocus();
 fireEvent.keyDown(last,{key:"Tab"});expect(first).toHaveFocus();
});
it("does not dismiss or dispatch twice while the command is pending",async()=>{
 let resolve!: (value:{success:true;message:string})=>void;
 vi.mocked(savePurchasePricingRuleAction).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 confirmation();fireEvent.change(screen.getByLabelText("Lý do ngừng sử dụng *"),{target:{value:"QA ngừng giá"}});
 fireEvent.click(screen.getByRole("button",{name:"Xác nhận ngừng sử dụng"}));
 await waitFor(()=>expect(savePurchasePricingRuleAction).toHaveBeenCalledTimes(1));
 fireEvent.keyDown(screen.getByRole("dialog"),{key:"Escape"});
 expect(screen.getByRole("dialog")).toBeInTheDocument();
 resolve({success:true,message:"Đã ngừng giá mua."});
 await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
 expect(screen.getByRole("status")).toHaveFocus();
});
it("returns focus to the retained rule summary when the editor disappears",()=>{
 const options={customers:[],groups:[],materials:[],units:[]};
 const view=render(<details open><summary tabIndex={0}>Quy tắc giá QA</summary><PricingRuleEditor purchase purchaseRule={existing} options={options} command={{targetId:"new",operationId:"stable-operation"}}/></details>);
 fireEvent.click(screen.getByRole("button",{name:"Ngừng sử dụng"}));
 view.rerender(<details open><summary tabIndex={0}>Quy tắc giá QA</summary></details>);
 expect(screen.getByText("Quy tắc giá QA")).toHaveFocus();
 expect(savePurchasePricingRuleAction).not.toHaveBeenCalled();
});
