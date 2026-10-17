"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FilePicker } from "@/components/ui/file-picker";
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES, logoMatchesType, type CompanyLogo, type LogoMime } from "@/lib/company/profile";
import { saveCompanyLogoAction, type CompanyLogoResult } from "@/modules/settings/company-actions";

type Pending = { mime: LogoMime; base64: string } | null;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

/** "Logo" in Thông tin doanh nghiệp: a PNG or JPG up to 300 KB, printed on documents next to the company name. */
export function CompanyLogoForm({ logo, profileSaved }: { logo: CompanyLogo | null; profileSaved: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(logo);
  const [chosen, setChosen] = useState<Pending>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [operation, setOperation] = useState<{ id: string; remove: boolean } | null>(null);
  const [result, setResult] = useState<CompanyLogoResult | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = chosen ?? current;

  async function choose(file: File | undefined) {
    setResult(null); setOperation(null); setProblem(null); setChosen(null);
    if (!file) return;
    const mime = (LOGO_MIME_TYPES as readonly string[]).includes(file.type) ? file.type as LogoMime : null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!mime || !logoMatchesType(mime, bytes)) { setProblem("Chọn ảnh PNG hoặc JPG."); return; }
    if (bytes.length > LOGO_MAX_BYTES) { setProblem("Logo tối đa 300 KB. Hãy thu nhỏ ảnh rồi chọn lại."); return; }
    setChosen({ mime, base64: toBase64(bytes) });
  }

  function save(remove: boolean) {
    if (pending) return;
    // An unknown outcome is retried with the same operation; any other new attempt is a new command.
    const op = operation && operation.remove === remove && result?.status === "UNKNOWN" ? operation : { id: crypto.randomUUID(), remove };
    setOperation(op);
    startTransition(async () => {
      let outcome: CompanyLogoResult;
      try {
        outcome = await saveCompanyLogoAction({ operationId: op.id, expectedSha256: current?.sha256 ?? null,
          mime: remove ? null : chosen?.mime ?? null, base64: remove ? null : chosen?.base64 ?? null });
      } catch {
        outcome = { status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." };
      }
      setResult(outcome);
      if (outcome.status !== "SUCCESS") return;
      setCurrent(remove || !chosen || !outcome.sha256 ? null : { ...chosen, sha256: outcome.sha256 });
      setChosen(null); setOperation(null);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  return <div className="company-logo">
    <div className="company-logo-preview" aria-label="Logo doanh nghiệp">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the profile, not a static asset */}
      {shown ? <img src={`data:${shown.mime};base64,${shown.base64}`} alt="Logo doanh nghiệp" /> : <span className="muted">Chưa có logo</span>}
    </div>
    <div className="company-logo-actions">
      <label className="field"><span>Logo (PNG hoặc JPG, tối đa 300 KB)</span>
        <FilePicker inputRef={input} accept="image/png,image/jpeg" disabled={pending || !profileSaved} onChange={(event) => void choose(event.currentTarget.files?.[0])} /></label>
      {!profileSaved && <p className="muted">Lưu tên doanh nghiệp trước, sau đó tải logo.</p>}
      {problem && <p className="form-message" role="alert">{problem}</p>}
      {result && <p className={result.status === "SUCCESS" ? "form-message success" : "form-message"} role={result.status === "SUCCESS" ? "status" : "alert"}>{result.message}</p>}
      <div className="form-actions">
        {current && !chosen && <button type="button" className="button button-danger" disabled={pending} onClick={() => save(true)}>
          {pending ? "Đang xóa..." : result?.status === "UNKNOWN" && operation?.remove ? "Xóa lại đúng thao tác" : "Xóa logo"}</button>}
        <button type="button" className="button button-secondary" disabled={pending || !chosen} onClick={() => save(false)}>
          {pending && !operation?.remove ? "Đang lưu..." : result?.status === "UNKNOWN" && !operation?.remove ? "Lưu lại đúng thao tác" : "Lưu logo"}</button>
      </div>
    </div>
  </div>;
}
