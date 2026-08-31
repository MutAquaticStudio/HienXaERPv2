"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="vi">
      <body>
        <main className="centered-state">
          <h1>Hệ thống đang cần kiểm tra</h1>
          <p>Thao tác của bạn chưa được ghi nhận. Hãy thử lại.</p>
          <button className="primary-button" type="button" onClick={reset}>
            Thử lại
          </button>
        </main>
      </body>
    </html>
  );
}
