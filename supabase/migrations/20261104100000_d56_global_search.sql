-- D56 (Owner 04/11): ô tìm chung trên thanh trên cùng — một lần gõ tìm khách, công trình, đơn bán, phiếu giao, đơn mua,
-- nhà cung cấp và vật tư của chi nhánh; gõ không dấu được; tìm theo số điện thoại; chỉ trả nhóm người dùng có quyền xem.

-- Lower case without Vietnamese marks ("Xây dựng An Phát" → "xay dung an phat"), for matching only.
create or replace function private.search_fold(value text) returns text
language sql immutable parallel safe
set search_path to ''
as $$
  -- NFC first (some keyboards send decomposed marks); upper-case marked letters are listed too, in case lower() is ASCII-only.
  select translate(lower(normalize(coalesce(value, ''), NFC)),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd')
$$;

create or replace function public.global_search(target_branch_id uuid, term text)
returns jsonb
language plpgsql stable security definer
set search_path to ''
as $$
declare
  needle text := private.search_fold(btrim(coalesce(term, '')));
  digits text := regexp_replace(coalesce(term, ''), '\D', '', 'g');
  pattern text;
  number_pattern text;
  result jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.employee_branch_access a join public.employees e on e.id = a.employee_id
      where a.branch_id = target_branch_id and a.active and e.active and e.auth_user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(needle) < 2 or char_length(needle) > 80 then return result; end if;
  pattern := '%' || replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  number_pattern := upper(btrim(term));
  if char_length(digits) < 3 then digits := null; end if;

  if private.has_permission(target_branch_id, 'customers.read') then
    result := result || jsonb_build_object('customers', coalesce((select jsonb_agg(row_to_json(x)) from (
      select c.id, c.code, c.display_name as name, c.phone
      from public.customers c
      where c.branch_id = target_branch_id and c.active
        and (private.search_fold(c.display_name) like pattern or lower(c.code) like pattern
          or (digits is not null and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || digits || '%'))
      order by (lower(c.code) = needle) desc, (private.search_fold(c.display_name) like needle || '%') desc, c.display_name
      limit 4) x), '[]'::jsonb));
    result := result || jsonb_build_object('sites', coalesce((select jsonb_agg(row_to_json(x)) from (
      select s.id, s.customer_id, s.name, c.display_name as customer_name, s.address_text
      from public.customer_sites s join public.customers c on c.id = s.customer_id
      where c.branch_id = target_branch_id and s.active
        and (private.search_fold(s.name) like pattern or private.search_fold(s.address_text) like pattern
          or (digits is not null and regexp_replace(coalesce(s.receiver_phone, ''), '\D', '', 'g') like '%' || digits || '%'))
      order by s.name
      limit 3) x), '[]'::jsonb));
  end if;

  if private.has_permission(target_branch_id, 'orders.read') then
    result := result || jsonb_build_object('orders', coalesce((select jsonb_agg(row_to_json(x)) from (
      select o.id, o.order_number as number, o.customer_name_snapshot as customer, o.site_name_snapshot as site, o.commercial_state as state, o.created_at
      from public.sales_orders o
      where o.branch_id = target_branch_id
        and (upper(o.order_number) = number_pattern or lower(o.order_number) like pattern
          or private.search_fold(o.customer_name_snapshot) like pattern or private.search_fold(o.site_name_snapshot) like pattern
          or (digits is not null and regexp_replace(coalesce(o.receiver_phone_snapshot, ''), '\D', '', 'g') like '%' || digits || '%'))
      order by (upper(o.order_number) = number_pattern) desc, o.created_at desc
      limit 4) x), '[]'::jsonb));
  end if;

  if private.has_permission(target_branch_id, 'delivery.read') then
    result := result || jsonb_build_object('deliveries', coalesce((select jsonb_agg(row_to_json(x)) from (
      select d.id, d.delivery_number as number, d.customer_name_snapshot as customer, d.site_name_snapshot as site, d.execution_state as state, d.scheduled_at
      from public.deliveries d
      where d.branch_id = target_branch_id
        and (upper(d.delivery_number) = number_pattern or lower(d.delivery_number) like pattern
          or private.search_fold(d.customer_name_snapshot) like pattern or private.search_fold(d.site_name_snapshot) like pattern
          or (digits is not null and regexp_replace(coalesce(d.receiver_phone_snapshot, ''), '\D', '', 'g') like '%' || digits || '%'))
      order by (upper(d.delivery_number) = number_pattern) desc, d.scheduled_at desc nulls last
      limit 4) x), '[]'::jsonb));
  end if;

  if private.has_permission(target_branch_id, 'purchasing.read') then
    result := result || jsonb_build_object('purchases', coalesce((select jsonb_agg(row_to_json(x)) from (
      select p.id, p.purchase_order_number as number, p.supplier_name_snapshot as supplier, p.destination_name_snapshot as destination, p.state, p.created_at
      from public.purchase_orders p
      where p.branch_id = target_branch_id
        and (upper(p.purchase_order_number) = number_pattern or lower(p.purchase_order_number) like pattern
          or private.search_fold(p.supplier_name_snapshot) like pattern)
      order by (upper(p.purchase_order_number) = number_pattern) desc, p.created_at desc
      limit 3) x), '[]'::jsonb));
    result := result || jsonb_build_object('suppliers', coalesce((select jsonb_agg(row_to_json(x)) from (
      select s.id, s.code, s.name, s.phone
      from public.suppliers s
      where s.branch_id = target_branch_id and s.active
        and (private.search_fold(s.name) like pattern or lower(s.code) like pattern
          or (digits is not null and regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') like '%' || digits || '%'))
      order by s.name
      limit 3) x), '[]'::jsonb));
  end if;

  if private.has_permission(target_branch_id, 'catalog.read') then
    result := result || jsonb_build_object('materials', coalesce((select jsonb_agg(row_to_json(x)) from (
      select m.id, m.code, m.name
      from public.materials m
      where m.active and (private.search_fold(m.name) like pattern or lower(m.code) like pattern)
      order by (lower(m.code) = needle) desc, m.name
      limit 4) x), '[]'::jsonb));
  end if;

  return result;
end
$$;

revoke all on function public.global_search(uuid, text) from public, anon;
grant execute on function public.global_search(uuid, text) to authenticated;
revoke all on function private.search_fold(text) from public, anon;
