import { ShieldCheck } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="HIỀN XA ERP">
      <span className="brand-mark" aria-hidden="true">
        <ShieldCheck size={compact ? 28 : 34} strokeWidth={2.2} />
      </span>
      <span>
        <strong>HIỀN XA ERP</strong>
        {!compact && <small>Nền tảng quản trị vật liệu xây dựng</small>}
      </span>
    </div>
  );
}
