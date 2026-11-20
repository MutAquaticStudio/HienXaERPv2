import { afterEach, describe, expect, it, vi } from "vitest";
import { appearanceAttributes, applyAppearance, DEFAULT_APPEARANCE, parseAppearance, serializeAppearance } from "@/lib/appearance";

afterEach(() => { document.cookie = "hx-appearance=; path=/; max-age=0"; vi.unstubAllGlobals(); });

describe("appearance", () => {
  it("round-trips a choice and falls back to the default for anything unknown", () => {
    const choice = { theme: "dark", fontSize: "lg", font: "be-vietnam", skin: "classic" } as const;
    expect(parseAppearance(serializeAppearance(choice))).toEqual(choice);
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("tim.xl.comic")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("system")).toEqual({ ...DEFAULT_APPEARANCE, theme: "system" });
  });

  it("starts in Be Vietnam Pro at the compact size (D29) and still honours a saved Noto Sans choice", () => {
    expect(DEFAULT_APPEARANCE).toEqual({ theme: "light", fontSize: "md", font: "be-vietnam", skin: "classic" });
    expect(parseAppearance("light.md.noto").font).toBe("noto");
  });

  it("renders the resolved colour only for an explicit choice", () => {
    expect(appearanceAttributes({ theme: "dark", fontSize: "sm", font: "noto", skin: "classic" })).toEqual({ "data-theme": "dark", "data-font-size": "sm", "data-font": "noto", "data-skin": "classic", "data-color": "dark" });
    expect(appearanceAttributes({ ...DEFAULT_APPEARANCE, theme: "system" })).not.toHaveProperty("data-color");
  });

  it("applies a choice to the open page and remembers it in a cookie", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("dark"), media: query }));
    const root = document.createElement("html");
    applyAppearance({ theme: "system", fontSize: "lg", font: "be-vietnam", skin: "classic" }, root);
    expect(root.getAttribute("data-color")).toBe("dark");
    expect(root.getAttribute("data-font-size")).toBe("lg");
    expect(document.cookie).toContain("hx-appearance=system.lg.be-vietnam");
  });

  it("keeps Classic as the default skin and stores Astryx as an optional fourth part (cookie stays backward compatible)", () => {
    expect(parseAppearance("dark.lg.be-vietnam").skin).toBe("classic");
    expect(parseAppearance("dark.lg.be-vietnam.astryx").skin).toBe("astryx");
    expect(parseAppearance("dark.lg.be-vietnam.moi").skin).toBe("classic");
    expect(serializeAppearance({ theme: "dark", fontSize: "lg", font: "be-vietnam", skin: "classic" })).toBe("dark.lg.be-vietnam");
    expect(serializeAppearance({ theme: "dark", fontSize: "lg", font: "be-vietnam", skin: "astryx" })).toBe("dark.lg.be-vietnam.astryx");
  });
});
