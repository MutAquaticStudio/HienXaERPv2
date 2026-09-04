import { LockKeyhole } from "lucide-react";
import { notFound } from "next/navigation";

const labels: Record<string, string> = {
  pool: "Bể công việc",
  earnings: "Thu nhập",
  profile: "Tôi",
};

export default async function WorkerSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const title = labels[section];
  if (!title) notFound();

  return (
    <section className="worker-locked-state">
      <h1>{title}</h1>
      <LockKeyhole aria-hidden="true" size={56} />
      <h2>Dự kiến mở tại P12</h2>
      <p>Thu nhập thuộc phase Lương thưởng &amp; Năng suất theo baseline.</p>
    </section>
  );
}
