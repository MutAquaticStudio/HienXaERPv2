"use client";

import { Palette } from "lucide-react";
import { useState } from "react";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { Dialog } from "@/components/ui/dialog";
import { currentAppearance, type Appearance } from "@/lib/appearance";

/** "Giao diện" in the side menu: every staff member can change colours and text size on their own device. */
export function AppearanceButton() {
  const [initial, setInitial] = useState<Appearance | null>(null);
  return <>
    <button className="logout-button" type="button" onClick={() => setInitial(currentAppearance())}><Palette size={17} />Giao diện</button>
    {initial && <Dialog title="Giao diện" description="Chế độ màu, cỡ chữ và phông chữ trên thiết bị này." onClose={() => setInitial(null)}><AppearanceForm initial={initial} /></Dialog>}
  </>;
}
