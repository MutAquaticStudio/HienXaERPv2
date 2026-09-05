import type { ReactNode } from "react";

export async function DeferredRead<T>({ label, load, render }: {
  label: string;
  load: () => Promise<T>;
  render: (data: T) => ReactNode;
}) {
  let data: T;
  try {
    data = await load();
  } catch {
    // The data layer records a sanitized error with its read ID.
    return <section role="alert"><p>Chưa tải được {label}. Bạn vẫn có thể làm việc với nội dung còn lại.</p></section>;
  }
  return render(data);
}
