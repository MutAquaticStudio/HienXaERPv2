"use server";
import { redirect } from "next/navigation";
import { requireInternalAccess } from "@/lib/access/context";

/** Compatibility for an already loaded legacy form; activation no longer writes. */
export async function activateOperations(form: FormData) {
 void form;
 await requireInternalAccess();
 redirect("/admin/operations");
}
