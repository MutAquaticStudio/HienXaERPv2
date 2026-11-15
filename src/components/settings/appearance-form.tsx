"use client";

import { useState } from "react";
import { applyAppearance, FONT_SIZES, FONTS, THEMES, type Appearance } from "@/lib/appearance";

type Choice = keyof Appearance;
const ALL_CHOICES: readonly Choice[] = ["theme", "fontSize", "font"];

/**
 * "Giao diện" (owner decision D10): applies at once on this device only; other devices keep their own choice.
 * D84: the worker and customer portals show the same form (colour mode and text size) in their own look, so one choice
 * covers the office and both portals on that device.
 */
export function AppearanceForm({ initial, choices = ALL_CHOICES, classes }: {
  initial: Appearance;
  /** The groups to show, in this order; the portals leave out the font. */
  choices?: readonly Choice[];
  /** Class names for another look; without them the office's segmented radios are used. */
  classes?: { root?: string; group?: string; options?: string };
}) {
  const [appearance, setAppearance] = useState(initial);
  const [saved, setSaved] = useState(false);
  function choose(next: Partial<Appearance>) {
    const value = { ...appearance, ...next };
    setAppearance(value);
    applyAppearance(value);
    setSaved(true);
  }
  const group = <K extends Choice>(key: K, legend: string, options: readonly { value: Appearance[K]; label: string }[]) => {
    const items = options.map((option) => <label key={option.value}><input type="radio" name={`appearance-${key}`} value={option.value} checked={appearance[key] === option.value}
      onChange={() => choose({ [key]: option.value } as Partial<Appearance>)} /> {option.label}</label>);
    return <fieldset className={classes?.group ?? "segmented-radio"} key={key}><legend>{legend}</legend>
      {classes?.options ? <div className={classes.options}>{items}</div> : items}
    </fieldset>;
  };
  const groups = { theme: () => group("theme", "Chế độ màu", THEMES), fontSize: () => group("fontSize", "Cỡ chữ", FONT_SIZES), font: () => group("font", "Phông chữ", FONTS) };
  return <div className={classes?.root ?? "appearance-options"}>
    {choices.map((choice) => groups[choice]())}
    <p className="muted" role="status">{saved ? "Đã áp dụng trên thiết bị này." : "Chỉ áp dụng trên thiết bị đang dùng; không ảnh hưởng người khác."}</p>
  </div>;
}
