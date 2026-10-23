/**
 * Giao diện per device (owner decision D10): light/dark/system, text size and font, kept in one cookie so the server
 * renders the right attributes on <html> and the page does not flash. Nothing is stored in the database.
 */
export const APPEARANCE_COOKIE = "hx-appearance";
export const APPEARANCE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export const THEMES = [{ value: "light", label: "Sáng" }, { value: "dark", label: "Tối" }, { value: "system", label: "Theo thiết bị" }] as const;
export const FONT_SIZES = [{ value: "sm", label: "Nhỏ" }, { value: "md", label: "Vừa" }, { value: "lg", label: "Lớn" }] as const;
// D29: Be Vietnam Pro is the default face; Noto Sans stays for whoever prefers it.
export const FONTS = [{ value: "be-vietnam", label: "Be Vietnam Pro" }, { value: "noto", label: "Noto Sans" }] as const;

export type Appearance = { theme: (typeof THEMES)[number]["value"]; fontSize: (typeof FONT_SIZES)[number]["value"]; font: (typeof FONTS)[number]["value"] };
export const DEFAULT_APPEARANCE: Appearance = { theme: "light", fontSize: "md", font: "be-vietnam" };

const pick = <T extends string>(options: readonly { value: T }[], value: string | undefined, fallback: T): T =>
  options.some((option) => option.value === value) ? value as T : fallback;

/** "theme.fontSize.font", e.g. "dark.lg.be-vietnam"; anything unknown falls back to the default. */
export function parseAppearance(value: string | undefined | null): Appearance {
  const [theme, fontSize, font] = (value ?? "").split(".");
  return {
    theme: pick(THEMES, theme, DEFAULT_APPEARANCE.theme),
    fontSize: pick(FONT_SIZES, fontSize, DEFAULT_APPEARANCE.fontSize),
    font: pick(FONTS, font, DEFAULT_APPEARANCE.font),
  };
}

export function serializeAppearance(appearance: Appearance) {
  return `${appearance.theme}.${appearance.fontSize}.${appearance.font}`;
}

/** Attributes for <html>; data-color is the resolved scheme ("system" is resolved by APPEARANCE_SCRIPT before paint). */
export function appearanceAttributes(appearance: Appearance) {
  return {
    "data-theme": appearance.theme,
    "data-font-size": appearance.fontSize,
    "data-font": appearance.font,
    ...(appearance.theme === "system" ? {} : { "data-color": appearance.theme }),
  };
}

/**
 * Resolves "Theo thiết bị" to light or dark before the first paint, follows the device setting while open, and restores
 * the resolved colour if a re-render of the root layout drops it.
 */
export const APPEARANCE_SCRIPT = `(function(){try{var r=document.documentElement,m=window.matchMedia("(prefers-color-scheme: dark)");var s=function(){if(r.getAttribute("data-theme")!=="system")return;var c=m.matches?"dark":"light";if(r.getAttribute("data-color")!==c)r.setAttribute("data-color",c)};s();m.addEventListener("change",s);new MutationObserver(s).observe(r,{attributes:true,attributeFilter:["data-theme","data-color"]})}catch(e){}})();`;

/** Applies a choice on this device at once: cookie for the next server render, attributes for the open page. */
export function applyAppearance(appearance: Appearance, root: HTMLElement = document.documentElement) {
  document.cookie = `${APPEARANCE_COOKIE}=${serializeAppearance(appearance)}; path=/; max-age=${APPEARANCE_MAX_AGE_SECONDS}; samesite=lax`;
  const attributes = appearanceAttributes(appearance);
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  if (appearance.theme === "system") root.setAttribute("data-color", window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

/** The choice saved on this device, read in the browser. */
export function currentAppearance(cookie: string = document.cookie): Appearance {
  const entry = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${APPEARANCE_COOKIE}=`));
  return parseAppearance(entry?.slice(APPEARANCE_COOKIE.length + 1));
}
