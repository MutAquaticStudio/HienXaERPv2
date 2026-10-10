"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type InputHTMLAttributes, type Ref } from "react";
import styles from "./file-picker.module.css";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue"> & {
  inputRef?: Ref<HTMLInputElement>;
};

export function FilePicker({ inputRef, onChange, className, disabled, "aria-describedby": describedBy, ...props }: FilePickerProps) {
  const nativeInput = useRef<HTMLInputElement>(null);
  const filenameId = useId();
  const [filename, setFilename] = useState("");
  useImperativeHandle(inputRef, () => nativeInput.current!, []);

  useEffect(() => {
    const form = nativeInput.current?.form;
    if (!form) return;
    function reset(event: Event) {
      // Reset is cancellable and runs before the browser clears its native file list.
      queueMicrotask(() => { if (!event.defaultPrevented) setFilename(""); });
    }
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  return <div className={`${styles.picker}${disabled ? ` ${styles.disabled}` : ""}`}>
    <span className={styles.choose} aria-hidden="true">Chọn tệp</span>
    <span className={styles.filename} id={filenameId} title={filename || undefined}>{filename || "Chưa chọn tệp"}</span>
    <input {...props} ref={nativeInput} type="file" disabled={disabled}
      className={`${styles.input}${className ? ` ${className}` : ""}`}
      aria-describedby={[describedBy, filenameId].filter(Boolean).join(" ")}
      onChange={(event) => {
        setFilename(Array.from(event.currentTarget.files ?? []).map((file) => file.name).join(", "));
        onChange?.(event);
      }} />
  </div>;
}
