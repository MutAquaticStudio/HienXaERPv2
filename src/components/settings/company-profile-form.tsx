"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { COMPANY_FIELDS, companyHeading, type CompanyField, type CompanyProfile } from "@/lib/company/profile";
import { saveCompanyProfileAction, type CompanySaveResult } from "@/modules/settings/company-actions";

const FIELDS: { key: CompanyField; label: string; placeholder?: string; wide?: boolean; inputMode?: "numeric" | "tel" | "email" }[] = [
  { key: "legal_name", label: "Tên doanh nghiệp *", placeholder: "Công ty TNHH Vật liệu xây dựng Hiền Xa", wide: true },
  { key: "tax_code", label: "Mã số thuế", placeholder: "0101234567", inputMode: "numeric" },
  { key: "phone", label: "Điện thoại", placeholder: "0912 345 678", inputMode: "tel" },
  { key: "address", label: "Địa chỉ", wide: true },
  { key: "email", label: "Email", inputMode: "email" },
  { key: "bank_name", label: "Ngân hàng", placeholder: "Vietcombank – CN Hà Nội" },
  { key: "bank_account_number", label: "Số tài khoản", inputMode: "numeric" },
  { key: "bank_account_holder", label: "Chủ tài khoản" },
];

/** "Thông tin doanh nghiệp" (owner decision D10): printed on orders, delivery notes, receipts and debt statements. */
export function CompanyProfileForm({ profile, logoSrc = null }: { profile: CompanyProfile | null; logoSrc?: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<CompanyField, string>>(() => Object.fromEntries(COMPANY_FIELDS.map((key) => [key, profile?.[key] ?? ""])) as Record<CompanyField, string>);
  const [version, setVersion] = useState<number | null>(profile?.version ?? null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<CompanySaveResult | null>(null);
  const [pending, startTransition] = useTransition();
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
      if (outcome.status === "SUCCESS") { setVersion(outcome.version ?? version); router.refresh(); }
    });
  }

  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); save(); }}>
    <div className="form-grid">
      {FIELDS.map((field) => <label key={field.key} className={field.wide ? "field field-full" : "field"}><span>{field.label}</span>
        <input name={field.key} value={values[field.key]} placeholder={field.placeholder} inputMode={field.inputMode} disabled={pending}
          required={field.key === "legal_name"} onChange={(event) => edit(field.key, event.target.value)} /></label>)}
    </div>
    <div className="company-preview" aria-label="Xem trước tiêu đề chứng từ">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the profile, not a static asset */}
      {logoSrc && <img src={logoSrc} alt="" />}
      <div><strong>{heading.name}</strong>{heading.lines.map((line) => <span key={line}>{line}</span>)}</div></div>
    {result && <p className={result.status === "SUCCESS" ? "form-message success" : "form-message"} role={result.status === "SUCCESS" ? "status" : "alert"}>{result.message}</p>}
    <div className="form-actions"><button type="submit" className="button button-primary" disabled={pending || values.legal_name.trim().length < 2}>
      {pending ? "Đang lưu..." : result?.status === "UNKNOWN" ? "Lưu lại đúng thao tác" : "Lưu thông tin doanh nghiệp"}</button></div>
  </form>;
}
