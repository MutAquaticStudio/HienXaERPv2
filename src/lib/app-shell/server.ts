import "server-only";
import { headers } from "next/headers";
import { isNativeApp } from "./native-app";

/** D82: this request comes from the Android app (hide "Tải app" links there). */
export async function openedInNativeApp(): Promise<boolean> {
  return isNativeApp((await headers()).get("user-agent"));
}
