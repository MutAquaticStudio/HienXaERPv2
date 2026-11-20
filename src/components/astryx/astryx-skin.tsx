"use client";

import type { ReactNode } from "react";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./astryx-skin.css";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

/** Wraps the app in the Astryx theme; the root layout renders it only when this device chose the "Astryx" skin. */
export function AstryxSkin({ children }: { children: ReactNode }) {
  return <Theme theme={neutralTheme}>{children}</Theme>;
}
