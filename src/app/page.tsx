import { requireInternalAccess } from "@/lib/access/context";
import { internalLandingPath } from "@/lib/access/landing";
import { redirect } from "next/navigation";

export default async function Home() {
  const access = await requireInternalAccess();
  redirect(internalLandingPath(access.permissions));
}
