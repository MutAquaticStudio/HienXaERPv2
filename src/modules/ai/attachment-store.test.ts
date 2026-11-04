// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { attachmentViews, safeObjectName, storeAttachments } from "./attachment-store";

it("D63: stores each file in the person's own folder under a safe name, skipping one that cannot be uploaded", async () => {
  expect(safeObjectName("Ảnh hóa đơn ĐỢT 1.jpg")).toBe("Anh-hoa-don-DOT-1.jpg");
  expect(safeObjectName("../../etc/passwd")).toBe("etc-passwd");
  expect(safeObjectName("???")).toBe("tep");
  const upload = vi.fn(async (path: string) => ({ error: path.includes("2-") ? { message: "too large" } : null }));
  const supabase = { storage: { from: vi.fn(() => ({ upload })) } };
  const kept = await storeAttachments(supabase as never, "user-1", "op-1", [
    { name: "Ảnh hóa đơn.jpg", mime: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) },
    { name: "khach.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: new Uint8Array([4]) },
  ]);
  expect(supabase.storage.from).toHaveBeenCalledWith("ai-attachments");
  expect(upload).toHaveBeenCalledWith("user-1/op-1/1-Anh-hoa-don.jpg", expect.any(Uint8Array), { contentType: "image/jpeg", upsert: false });
  expect(kept).toEqual([{ path: "user-1/op-1/1-Anh-hoa-don.jpg", name: "Ảnh hóa đơn.jpg", mime: "image/jpeg", size: 3 }]);
});

it("gives pictures and PDFs a one-hour link and lists other files by name", async () => {
  const createSignedUrls = vi.fn(async () => ({ data: [{ path: "u/o/1-a.jpg", signedUrl: "https://x.supabase.co/sign/a" }], error: null }));
  const supabase = { storage: { from: () => ({ createSignedUrls }) } };
  const views = await attachmentViews(supabase as never, [
    { path: "u/o/1-a.jpg", name: "a.jpg", mime: "image/jpeg", size: 10 }, { path: "u/o/2-k.xlsx", name: "k.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 5 },
  ]);
  expect(createSignedUrls).toHaveBeenCalledWith(["u/o/1-a.jpg"], 3600);
  expect(views).toEqual([{ name: "a.jpg", mime: "image/jpeg", size: 10, url: "https://x.supabase.co/sign/a" },
    { name: "k.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 5 }]);
});
