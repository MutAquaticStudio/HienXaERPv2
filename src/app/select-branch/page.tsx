import { AuthFrame } from "@/components/auth/auth-frame";
import { selectBranchAction } from "@/lib/auth/actions";
import { createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type BranchAccessRow = { branch_id: string; branches: { name: string; code: string } | null };

export default async function SelectBranchPage({ searchParams }: PageProps<"/select-branch">) {
  const params = await searchParams;
  const surface = params.surface === "work" ? "work" : "admin";
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect(surface === "work" ? "/work/login" : "/login");
  const { data: employee } = await supabase.from("employees").select("id").eq("auth_user_id", authData.user.id).eq("active", true).single();
  if (!employee) redirect(surface === "work" ? "/work/login" : "/login");
  const { data } = await supabase.from("employee_branch_access").select("branch_id, branches(name, code)").eq("employee_id", employee.id).eq("active", true);
  const branches = (data ?? []) as unknown as BranchAccessRow[];

  return <AuthFrame><p className="eyebrow">Chi nhánh</p><h1>Bạn đang làm việc tại đâu?</h1><p className="muted">Hệ thống kiểm tra quyền truy cập trước khi mở giao diện.</p><form action={selectBranchAction} className="auth-form"><input type="hidden" name="surface" value={surface} /><div className="field"><label htmlFor="branchId">Chi nhánh đang hoạt động</label><select id="branchId" name="branchId" required>{branches.map((branch) => <option key={branch.branch_id} value={branch.branch_id}>{branch.branches?.name} · {branch.branches?.code}</option>)}</select></div><button className="button button-primary auth-submit" type="submit">Tiếp tục</button></form></AuthFrame>;
}
