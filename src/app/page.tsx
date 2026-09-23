import { requireInternalAccess } from "@/lib/access/context";
import { redirect } from "next/navigation";

export default async function Home() {
  const access = await requireInternalAccess();
  redirect(access.permissions.has("dashboard.read") ? "/admin" : "/work");
}
