"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "hien-xa-large-text";

export function LargeTextToggle() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) === "true";
    document.documentElement.dataset.textSize = saved ? "large" : "standard";
    buttonRef.current?.setAttribute("aria-pressed", String(saved));
    buttonRef.current?.setAttribute(
      "aria-label",
      saved ? "Tắt chế độ chữ lớn" : "Bật chế độ chữ lớn",
    );
  }, []);

  function toggle() {
    const next = buttonRef.current?.getAttribute("aria-pressed") !== "true";
    window.localStorage.setItem(STORAGE_KEY, String(next));
    document.documentElement.dataset.textSize = next ? "large" : "standard";
    buttonRef.current?.setAttribute("aria-pressed", String(next));
    buttonRef.current?.setAttribute(
      "aria-label",
      next ? "Tắt chế độ chữ lớn" : "Bật chế độ chữ lớn",
    );
  }

  return (
    <button
      type="button"
      ref={buttonRef}
      className="text-toggle"
      onClick={toggle}
      aria-pressed="false"
      aria-label="Bật chế độ chữ lớn"
    >
      <span>Chữ lớn</span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
