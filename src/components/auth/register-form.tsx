"use client";

import { LockKeyhole, Mail, MapPin, Phone, UserPlus, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useActionState } from "react";
import { registerCustomerAccountAction, type RegistrationField } from "@/lib/auth/actions";

type Field = { name: RegistrationField; label: string; icon: ReactNode; input: Record<string, unknown>; area?: boolean; hint?: string };

const FIELDS: Field[] = [
  { name: "name", label: "Họ tên hoặc tên cửa hàng", icon: <UserRound size={18} aria-hidden="true" />, input: { autoComplete: "name", minLength: 2, maxLength: 160 } },
  { name: "phone", label: "Số điện thoại", icon: <Phone size={18} aria-hidden="true" />, input: { type: "tel", inputMode: "tel", autoComplete: "tel", maxLength: 20 }, hint: "Ví dụ 0912345678" },
  { name: "address", label: "Địa chỉ giao hàng", icon: <MapPin size={18} aria-hidden="true" />, input: { autoComplete: "street-address", minLength: 5, maxLength: 300 }, area: true },
  { name: "email", label: "Email", icon: <Mail size={18} aria-hidden="true" />, input: { type: "email", inputMode: "email", autoComplete: "email", maxLength: 200 } },
  { name: "password", label: "Mật khẩu", icon: <LockKeyhole size={18} aria-hidden="true" />, input: { type: "password", autoComplete: "new-password", minLength: 8, maxLength: 72 }, hint: "Từ 8 ký tự" },
  { name: "confirm", label: "Nhập lại mật khẩu", icon: <LockKeyhole size={18} aria-hidden="true" />, input: { type: "password", autoComplete: "new-password", minLength: 8, maxLength: 72 } },
];

/**
 * D14 "Đăng ký tài khoản" on the customer portal: who the customer is and where to deliver, then the login. The business is
 * told and checks the new customer; prices are the general price list until it assigns a price group.
 * D58: a refused form keeps what was typed (passwords excepted) and marks the box that is wrong.
 */
export function RegisterForm() {
  const [state, action, pending] = useActionState(registerCustomerAccountAction, undefined);
  if (state?.success) return <div className="auth-form"><p className="form-message success" role="status">{state.message}</p><a className="button button-primary auth-submit" href="/customer/login">Đi tới đăng nhập</a></div>;
  const errors = state?.fieldErrors ?? {};
  const firstWrong = FIELDS.find((field) => errors[field.name])?.name;
  return (
    <form action={action} className="auth-form" key={state?.attempt ?? 0} noValidate={Boolean(state?.attempt)}>
      {FIELDS.map((field) => {
        const id = `register-${field.name}`, error = errors[field.name];
        const described = [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
        const props = { id, name: field.name, required: true, defaultValue: field.name === "password" || field.name === "confirm" ? undefined : state?.fields?.[field.name],
          "aria-invalid": error ? true : undefined, "aria-describedby": described, autoFocus: field.name === firstWrong, ...field.input };
        return <div className={`field${error ? " field-invalid" : ""}`} key={field.name}>
          <label htmlFor={id}>{field.label}</label>
          <div className={`input-with-icon${field.area ? " input-icon-top" : ""}`}>{field.icon}{field.area ? <textarea {...props} /> : <input {...props} />}</div>
          {field.hint && !error && <small className="field-hint" id={`${id}-hint`}>{field.hint}</small>}
          {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
        </div>;
      })}
      {state?.message && <p className="form-message" role="alert">{state.message}</p>}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}><UserPlus size={19} />{pending ? "Đang đăng ký..." : "Đăng ký"}</button>
      <p className="auth-note">Không có email? Gọi cửa hàng để được tạo tài khoản đăng nhập bằng số điện thoại.</p>
      <a className="auth-link" href="/customer/login">Đã có tài khoản? Đăng nhập</a>
    </form>
  );
}
