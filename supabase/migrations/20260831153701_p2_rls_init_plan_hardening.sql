-- HIỀN XA ERP P2 — evaluate stable auth helpers once per statement instead of
-- once per row. This preserves the P1 authorization model while removing the
-- Supabase Auth RLS Initialization Plan performance warnings.

drop policy if exists user_profiles_read_self_or_admin on public.user_profiles;
create policy user_profiles_read_self_or_admin
on public.user_profiles for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    user_id = (select auth.uid())
    or (select app_private.has_permission('user.manage'))
  )
);

drop policy if exists roles_read_active on public.roles;
create policy roles_read_active
on public.roles for select to authenticated
using ((select app_private.is_active_user((select auth.uid()))));

drop policy if exists permissions_read_active on public.permissions;
create policy permissions_read_active
on public.permissions for select to authenticated
using ((select app_private.is_active_user((select auth.uid()))));

drop policy if exists user_roles_read_self_or_admin on public.user_roles;
create policy user_roles_read_self_or_admin
on public.user_roles for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    user_id = (select auth.uid())
    or (select app_private.has_permission('role.manage'))
  )
);

drop policy if exists role_permissions_read_active on public.role_permissions;
create policy role_permissions_read_active
on public.role_permissions for select to authenticated
using ((select app_private.is_active_user((select auth.uid()))));

drop policy if exists data_scopes_read_self_or_admin on public.data_scopes;
create policy data_scopes_read_self_or_admin
on public.data_scopes for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    user_id = (select auth.uid())
    or (select app_private.has_permission('user.manage'))
  )
);

drop policy if exists work_items_read_authorized on public.work_items;
create policy work_items_read_authorized
on public.work_items for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (
      assigned_user_id = (select auth.uid())
      and (select app_private.has_permission('work_item.read_assigned'))
    )
    or (select app_private.has_permission('work_pool.read'))
  )
);

drop policy if exists audit_events_read_auditor on public.audit_events;
create policy audit_events_read_auditor
on public.audit_events for select to authenticated
using ((select app_private.has_permission('audit.view')));

drop policy if exists evidence_read_owner_or_auditor on public.evidence;
create policy evidence_read_owner_or_auditor
on public.evidence for select to authenticated
using (
  (select app_private.is_active_user((select auth.uid())))
  and (
    (
      owner_user_id = (select auth.uid())
      and (select app_private.has_permission('evidence.read'))
    )
    or (select app_private.has_permission('audit.view'))
  )
);

drop policy if exists evidence_insert_owner on public.evidence;
create policy evidence_insert_owner
on public.evidence for insert to authenticated
with check (
  (select app_private.is_active_user((select auth.uid())))
  and owner_user_id = (select auth.uid())
  and (select app_private.has_permission('evidence.create'))
  and split_part(storage_path, '/', 1) = (select auth.uid())::text
);
