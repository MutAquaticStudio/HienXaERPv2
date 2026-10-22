import { cleanup,render,screen } from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {CancelDocumentForm} from "./cancel-document-form";
afterEach(cleanup);
it("requires explicit confirmation and takes an optional bounded note for audited draft cancellation",()=>{
 const action=vi.fn();render(<CancelDocumentForm entityId="doc" operationId="intent" state="DRAFT" label="Hủy đơn" action={action}/>);
 expect(screen.getByRole("button",{name:"Xóa nháp (hủy có lịch sử)"})).toBeInTheDocument();expect(screen.getByRole("checkbox")).toBeRequired();expect(screen.getByLabelText("Ghi chú (không bắt buộc)")).not.toBeRequired();expect(screen.getByLabelText("Ghi chú (không bắt buộc)")).toHaveAttribute("maxLength","500");expect(screen.queryByLabelText(/Lý do/)).not.toBeInTheDocument();expect(action).not.toHaveBeenCalled();
});
it("does not label confirmed economic documents as deleted drafts",()=>{render(<CancelDocumentForm entityId="doc" operationId="intent" state="CONFIRMED" label="Hủy đơn mua" action={vi.fn()}/>);expect(screen.getByRole("button",{name:"Hủy đơn mua"})).toBeInTheDocument();expect(screen.queryByText("Xóa nháp (hủy có lịch sử)")).not.toBeInTheDocument();});
