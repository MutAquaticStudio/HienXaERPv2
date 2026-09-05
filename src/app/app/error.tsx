"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ModuleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    console.error(JSON.stringify({ event: "module.render.error", digest: error.digest }));
  }, [error]);

  return (
    <section className="centered-state" role="alert">
      <h1>Chưa tải được module</h1>
      <p>Kết nối đang chậm hoặc dữ liệu chưa tải được. Bạn có thể thử lại hoặc chọn module khác.</p>
      {error.digest ? <p>Mã hỗ trợ: {error.digest}</p> : null}
      <button
        className="primary-button"
        disabled={pending}
        onClick={() => startTransition(() => { router.refresh(); reset(); })}
        type="button"
      >
        {pending ? "Đang tải lại..." : "Thử lại"}
      </button>
    </section>
  );
}
