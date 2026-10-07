import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/core/errors";

type EmployeeOption = { id: string; display_name: string };
type Membership = { employees: EmployeeOption | EmployeeOption[] | null };

export async function listAssignmentEmployees(client: Pick<SupabaseClient, "from">, branchId: string) {
  const { data, error } = await client.from("employee_branch_access")
    .select("employees!inner(id, display_name), roles!inner(active)")
    .eq("branch_id", branchId)
    .eq("active", true)
    .eq("employees.active", true)
    .eq("roles.active", true);
  if (error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to load assignment employees.", status: 503 });
  const employees = new Map<string, EmployeeOption>();
  for (const row of (data ?? []) as unknown as Membership[]) {
    const related = Array.isArray(row.employees) ? row.employees : [row.employees];
    for (const employee of related) {
      if (!employee || typeof employee.id !== "string" || typeof employee.display_name !== "string") {
        throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Invalid assignment employee response.", status: 503 });
      }
      employees.set(employee.id, { id: employee.id, display_name: employee.display_name });
    }
  }
  return { data: [...employees.values()].sort((a, b) => a.display_name.localeCompare(b.display_name)), error: null };
}
