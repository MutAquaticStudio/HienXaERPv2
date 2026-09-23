delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.code in ('uat_worker', 'hxqa_worker')
  and rp.permission_code = 'compensation.read';
