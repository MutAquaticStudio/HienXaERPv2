"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { COMPANY_FIELDS, companyHeading, type CompanyField, type CompanyProfile } from "@/lib/company/profile";
import { saveCompanyProfileAction, type CompanySaveResult } from "@/modules/settings/company-actions";

type FieldSpec = { key: CompanyField; label: string; placeholder?: string; wide?: boolean; inputMode?: "numeric" | "tel" | "email"; type?: "tel" | "email"; autoComplete?: string };
const FIELDS: FieldSpec[] = [
  { key: "legal_name", label: "Tên doanh nghiệp (bắt buộc)", placeholder: "Công ty TNHH Vật liệu xây dựng Hiền Xa", wide: true, autoComplete: "organization" },
  { key: "tax_code", label: "Mã số thuế", placeholder: "0101234567", inputMode: "numeric", autoComplete: "off" },
  { key: "phone", label: "Điện thoại", placeholder: "0912 345 678", inputMode: "tel", type: "tel", autoComplete: "tel" },
  { key: "address", label: "Địa chỉ", wide: true, autoComplete: "street-address" },
  { key: "email", label: "Email", inputMode: "email", type: "email", autoComplete: "email" },
];
/** D59: the three bank fields read as one block — they print together as "Thông tin chuyển khoản". */
const BANK_FIELDS: FieldSpec[] = [
  { key: "bank_name", label: "Ngân hàng", placeholder: "Vietcombank – CN Hà Nội", autoComplete: "off" },
  { key: "bank_account_number", label: "Số tài khoản", inputMode: "numeric", autoComplete: "off" },
  { key: "bank_account_holder", label: "Chủ tài khoản", autoComplete: "off" },
];

/** "Thông tin doanh nghiệp" (owner decision D10): printed on orders, delivery notes, receipts and debt statements. */
export function CompanyProfileForm({ profile, logoSrc = null }: { profile: CompanyProfile | null; logoSrc?: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<CompanyField, string>>(() => Object.fromEntries(COMPANY_FIELDS.map((key) => [key, profile?.[key] ?? ""])) as Record<CompanyField, string>);
  const [version, setVersion] = useState<number | null>(profile?.version ?? null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<CompanySaveResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [baseline, setBaseline] = useState(values);
  const dirty = COMPANY_FIELDS.some((key) => values[key] !== baseline[key]);
  const heading = companyHeading({ ...Object.fromEntries(COMPANY_FIELDS.map((key) => [key, values[key].trim() || null])) as Record<CompanyField, string | null>, version: version ?? 0 });

  function edit(key: CompanyField, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    // A changed form is a new command; an unknown outcome is only retried with the same data.
    if (result?.status !== "UNKNOWN") { setOperationId(crypto.randomUUID()); setResult(null); }
  }

  function save() {
    if (pending) return;
    startTransition(async () => {
      let outcome: CompanySaveResult;
      try {
        outcome = await saveCompanyProfileAction({ operationId, expectedVersion: version, profile: values });
      } catch {
        outcome = { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
      }
      setResult(outcome);
      if (outcome.status === "UNKNOWN") return;
      setOperationId(crypto.randomUUID());
      if (outcome.status === "SUCCESS") { setVersion(outcome.version ?? version); setBaseline(values); router.refresh(); }
    });
  }

  const input = (field: FieldSpec) => <label key={field.key} className={field.wide ? "field field-full" : "field"}><span>{field.label}</span>
    <input name={field.key} type={field.type ?? "text"} value={values[field.key]} placeholder={field.placeholder} inputMode={field.inputMode} autoComplete={field.autoComplete}
      disabled={pending} required={field.key === "legal_name"} onChange={(event) => edit(field.key, event.target.value)} /></label>;

  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); save(); }}>
    <div className="form-grid">{FIELDS.map(input)}</div>
    <fieldset className="settings-fieldset"><legend>Thông tin chuyển khoản</legend><div className="form-grid">{BANK_FIELDS.map(input)}</div></fieldset>
    <div className="company-preview" aria-label="Xem trước tiêu đề chứng từ">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the profile, not a static asset */}
      {logoSrc && <img src={logoSrc} alt="" />}
      <div><strong>{heading.name}</strong>{heading.lines.map((line) => <span key={line}>{line}</span>)}</div></div>
    {result && <p className={result.status === "SUCCESS" ? "form-message success" : "form-message"} role={result.status === "SUCCESS" ? "status" : "alert"}>{result.message}</p>}
    <div className="form-actions">{dirty && result?.status !== "UNKNOWN" && <span className="settings-dirty" role="status">Có thay đổi chưa lưu</span>}
      <button type="submit" className="button button-primary" disabled={pending || values.legal_name.trim().length < 2 || (!dirty && result?.status !== "UNKNOWN" && version !== null)}>
      {pending ? "Đang lưu..." : result?.status === "UNKNOWN" ? "Lưu lại đúng thao tác" : "Lưu thông tin doanh nghiệp"}</button></div>
  </form>;
}
