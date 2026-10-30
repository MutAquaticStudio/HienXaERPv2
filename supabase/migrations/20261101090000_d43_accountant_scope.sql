-- D43 (Owner 01/11): the built-in "Kế toán" role works on money only. It no longer reads deliveries or purchase orders
-- (menus Giao hàng / Mua hàng). Supplier names stay readable for Công nợ phải trả, Sổ quỹ and Chi phí.
-- Custom roles and per-employee extra grants are left as they are.
begin;

delete from public.role_permissions rp
using public.roles r
where r.id = rp.role_id
  and r.code = 'builtin_accountant'
  and r.system_role
  and rp.permission_code in ('delivery.read', 'purchasing.read', 'purchasing.price.read');

commit;
