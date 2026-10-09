import { expect,it,vi } from "vitest";
import { applyDocumentListScope } from "./document-list-scope";
it.each(["state","commercial_state"])("keeps %s cancelled history explicit, not deleted",field=>{
 const q={eq:vi.fn(),neq:vi.fn()};q.eq.mockReturnValue(q);q.neq.mockReturnValue(q);
 expect(applyDocumentListScope(q,field,"")).toBe(q);expect(q.neq).toHaveBeenCalledWith(field,"CANCELLED");
 expect(applyDocumentListScope(q,field,"CANCELLED")).toBe(q);expect(q.eq).toHaveBeenCalledWith(field,"CANCELLED");
 vi.clearAllMocks();expect(applyDocumentListScope(q,field,"ALL")).toBe(q);expect(q.eq).not.toHaveBeenCalled();expect(q.neq).not.toHaveBeenCalled();
});
