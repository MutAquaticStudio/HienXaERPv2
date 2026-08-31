"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="centered-state">
      <h1>Chưa tải được nội dung</h1>
      <p>Dữ liệu chưa thay đổi. Hãy thử lại.</p>
      <button className="primary-button" type="button" onClick={reset}>
        Thử lại
      </button>
    </main>
  );
}
