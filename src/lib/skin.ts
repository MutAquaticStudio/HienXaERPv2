import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/appearance";

/** The interface kind chosen on this device ("classic" or "astryx"); pages render the matching view. Outside a request it is "classic". */
export async function currentSkin() {
  try { return parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value).skin; } catch { return "classic" as const; }
}
