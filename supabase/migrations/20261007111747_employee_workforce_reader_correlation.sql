BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
ALTER POLICY employees_workforce_read ON public.employees
USING (
  EXISTS (
    SELECT 1
    FROM public.employee_branch_access AS a
    WHERE a.employee_id = employees.id
      AND a.active
      AND (
        private.has_permission(a.branch_id, 'workforce.read')
        OR private.has_permission(a.branch_id, 'compensation.read')
      )
  )
);
COMMIT;
