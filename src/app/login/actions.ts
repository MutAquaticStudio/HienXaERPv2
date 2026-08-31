"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { canUseSyntheticAuth } from "@/modules/platform/environment";

export async function login(formData: FormData) {
  const identity = String(formData.get("identity") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (
    !identity ||
    !password ||
    identity.length > 254 ||
    password.length > 256
  ) {
    redirect("/login?error=missing_fields");
  }

  if (canUseSyntheticAuth()) {
    const isWorker = identity.toLowerCase().includes("worker");
    const cookieStore = await cookies();
    cookieStore.set("hx-synthetic-role", isWorker ? "worker" : "office", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    redirect(isWorker ? "/work" : "/app");
  }

  if (!getSupabasePublicConfig()) {
    redirect("/login?error=configuration");
  }

  const supabase = await createClient();
  const credentials = identity.includes("@")
    ? { email: identity, password }
    : { phone: identity, password };
  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) redirect("/login?error=invalid_credentials");
  redirect("/app");
}

export async function logout() {
  if (canUseSyntheticAuth()) {
    const cookieStore = await cookies();
    cookieStore.delete("hx-synthetic-role");
  } else if (getSupabasePublicConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "global" });
  }
  redirect("/login");
}
