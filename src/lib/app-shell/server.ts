import "server-only";
import { headers } from "next/headers";
import { isNativeApp, nativeAppHasPush } from "./native-app";

/** D82: this request comes from the Android app (hide "Tải app" links there). */
export async function openedInNativeApp(): Promise<boolean> {
  return isNativeApp((await headers()).get("user-agent"));
}

/** D86: this request comes from an Android app older than 2.3.0, which cannot receive push (its push sections stay hidden). */
export async function openedInAppWithoutPush(): Promise<boolean> {
  const agent = (await headers()).get("user-agent");
  return isNativeApp(agent) && !nativeAppHasPush(agent);
}
