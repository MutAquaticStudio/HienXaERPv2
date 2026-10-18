"use client";

/**
 * FB5: "Nhận đủ" fills every open line with what is still due, so receiving a full delivery is one tap plus the usual
 * "Xác nhận nhận hàng". Nothing is posted until that button is pressed; each box can still be changed.
 */
export function FillRemainingButton({ lines, label = "Nhận đủ (điền số còn lại)" }: { lines: { inputId: string; remaining: string }[]; label?: string }) {
  return <button type="button" className="button button-secondary action-full" onClick={() => {
    for (const line of lines) {
      const input = document.getElementById(line.inputId);
      if (input instanceof HTMLInputElement) input.value = line.remaining;
    }
  }}>{label}</button>;
}
