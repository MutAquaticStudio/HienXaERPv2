-- FB7: the customer portal "Tài khoản" shows the customer's own details and delivery addresses, nothing staff-only.
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f255000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_KH255', 'Khách thử 255', 'BUSINESS'),
  ('7f255000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_KH256', 'Khách khác 256', 'BUSINESS');
update public.customers set phone = '0901255255', address_text = '25 Lê Lợi', tax_code = '0101255255', payment_terms_days = 15,
  credit_limit_vnd = 5000000, internal_note = 'Ghi chú nội bộ' where id = '7f255000-0000-4000-8000-000000000001';
insert into public.customer_sites(id, customer_id, code, name, address_text, receiver_name, receiver_phone) values
  ('7f255000-0000-4000-8000-000000000011', '7f255000-0000-4000-8000-000000000001', 'CT1', 'Nhà phố', '25 Lê Lợi', 'Chị Hoa', '0902255255');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('10000000-0000-4000-8000-000000000003', '7f255000-0000-4000-8000-000000000001', 'RECEIVER'),
  ('10000000-0000-4000-8000-000000000002', '7f255000-0000-4000-8000-000000000001', 'OWNER');

do $test$
declare account jsonb; failed text;
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000002');
  account := public.customer_portal_account();
  assert account->'customer'->>'code' = 'NT_KH255' and account->'customer'->>'phone' = '0901255255'
    and account->'customer'->>'tax_code' = '0101255255' and (account->'customer'->>'payment_terms_days')::integer = 15, format('owner sees own details %s', account);
  assert account->>'membership_role' = 'OWNER' and jsonb_array_length(account->'sites') = 1
    and account->'sites'->0->>'receiver_name' = 'Chị Hoa', format('sites %s', account);
  assert not (account->'customer' ? 'credit_limit_vnd') and not (account->'customer' ? 'internal_note'), 'staff-only fields hidden';

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  account := public.customer_portal_account();
  assert account->>'membership_role' = 'RECEIVER' and not (account->'customer' ? 'payment_terms_days'), 'receiver does not see payment terms';
  failed := null;
  begin perform public.customer_portal_account('7f255000-0000-4000-8000-000000000002'); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('another customer is refused, got %s', failed);

  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.customer_portal_account(); exception when others then failed := sqlstate; end;
  assert failed = '42501', format('no membership is refused, got %s', failed);

  perform pg_temp.act_as_admin();
  assert not has_function_privilege('anon', 'public.customer_portal_account(uuid)', 'execute'), 'anon cannot read accounts';
end
$test$;
