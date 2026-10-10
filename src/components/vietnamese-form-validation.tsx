"use client";

import { useEffect } from "react";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isFormControl(target: EventTarget | null): target is FormControl {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

// Translate browser validation feedback; keep native constraints and server validation intact.
export function VietnameseFormValidation() {
  useEffect(() => {
    const translated = new WeakMap<FormControl, string>();
    function invalid(event: Event) {
      if (!isFormControl(event.target)) return;
      const field = event.target;
      if (field.validationMessage === translated.get(field)) field.setCustomValidity("");
      if (field.validity.valid) {
        translated.delete(field);
        return;
      }
      if (field.validity.customError) return;
      const validity = field.validity;
      const message = validity.valueMissing ? "Vui lòng nhập thông tin này"
        : validity.typeMismatch && field instanceof HTMLInputElement && field.type === "email" ? "Vui lòng nhập địa chỉ thư điện tử hợp lệ"
        : validity.rangeUnderflow ? `Vui lòng nhập giá trị từ ${field instanceof HTMLInputElement ? field.min : ""} trở lên`
        : validity.rangeOverflow ? `Vui lòng nhập giá trị không vượt quá ${field instanceof HTMLInputElement ? field.max : ""}`
        : "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại";
      field.setCustomValidity(message);
      translated.set(field, message);
    }
    function clear(event: Event) {
      if (isFormControl(event.target) && translated.has(event.target)) {
        if (event.target.validationMessage === translated.get(event.target)) event.target.setCustomValidity("");
        translated.delete(event.target);
      }
    }
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", clear, true);
    document.addEventListener("change", clear, true);
    return () => {
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", clear, true);
      document.removeEventListener("change", clear, true);
    };
  }, []);
  return null;
}
