import { redirect } from "next/navigation";

/** D66: the assistant's chat lives only in Tin nhắn; an old link or bookmark to this page opens it there. */
export default function AiPage(): never {
  redirect("/admin/messages?ai=1");
}
