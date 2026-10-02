import { RecoveryConfirmForm } from "@/components/auth/recovery-confirm-form";

export default async function RecoveryConfirmPage({ searchParams }: PageProps<"/recovery/confirm">) {
  const params = await searchParams;
  const surface = params.surface === "work" || params.surface === "customer" ? params.surface : "admin";
  const hasAuthError = Boolean(params.error || params.error_code);
  return <RecoveryConfirmForm surface={surface} hasAuthError={hasAuthError} />;
}
