"use client";

import { useState } from "react";
import { applyAppearance, FONT_SIZES, FONTS, THEMES, type Appearance } from "@/lib/appearance";

/** "Giao diện" (owner decision D10): applies at once on this device only; other devices keep their own choice. */
export function AppearanceForm({ initial }: { initial: Appearance }) {
  const [appearance, setAppearance] = useState(initial);
  const [saved, setSaved] = useState(false);
  function choose(next: Partial<Appearance>) {
    const value = { ...appearance, ...next };
    setAppearance(value);
    applyAppearance(value);
    setSaved(true);
  }
  const group = <K extends keyof Appearance>(key: K, legend: string, options: readonly { value: Appearance[K]; label: string }[]) =>
    <fieldset className="segmented-radio" key={key}><legend>{legend}</legend>
      {options.map((option) => <label key={option.value}><input type="radio" name={`appearance-${key}`} value={option.value} checked={appearance[key] === option.value}
        onChange={() => choose({ [key]: option.value } as Partial<Appearance>)} /> {option.label}</label>)}
    </fieldset>;
  return <div className="appearance-options">
    {group("theme", "Chế độ màu", THEMES)}
    {group("fontSize", "Cỡ chữ", FONT_SIZES)}
    {group("font", "Phông chữ", FONTS)}
    <p className="muted" role="status">{saved ? "Đã áp dụng trên thiết bị này." : "Chỉ áp dụng trên thiết bị đang dùng; không ảnh hưởng người khác."}</p>
  </div>;
}
