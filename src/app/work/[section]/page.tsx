import { LockKeyhole } from "lucide-react";
import { notFound } from "next/navigation";

const labels: Record<string, string> = {
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
      <h2>Thông tin cá nhân đang được hoàn thiện</h2>
      <p>
        Bạn vẫn có thể xem việc, thu nhập và trạng thái đối soát từ thanh điều
        hướng.
      </p>
    </section>
  );
}
