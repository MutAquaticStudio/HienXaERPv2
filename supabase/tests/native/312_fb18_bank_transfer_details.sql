-- FB18: customers see the one bank account the owner marked in the cash book; receivers and other customers do not.
insert into auth.users(id, email) values
  ('7f312000-0000-4000-8000-0000000000a1', 'chu312@example.test'),
  ('7f312000-0000-4000-8000-0000000000a2', 'nhan312@example.test');
insert into public.customers(id, branch_id, code, display_name, customer_type) values
  ('7f312000-0000-4000-8000-000000000040', '20000000-0000-4000-8000-00000000000a', 'NT_KH312', 'Khách thử 312', 'BUSINESS');
insert into public.customer_portal_memberships(auth_user_id, customer_id, membership_role) values
  ('7f312000-0000-4000-8000-0000000000a1', '7f312000-0000-4000-8000-000000000040', 'OWNER'),
  ('7f312000-0000-4000-8000-0000000000a2', '7f312000-0000-4000-8000-000000000040', 'RECEIVER');
insert into public.finance_accounts(id, branch_id, code, name, account_kind, created_by) values
  ('7f312000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-00000000000a', 'NT_TM312', 'Tiền mặt 312', 'CASH', '10000000-0000-4000-8000-000000000001'),
  ('7f312000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-00000000000a', 'NT_VCB312', 'Vietcombank 312', 'BANK', '10000000-0000-4000-8000-000000000001'),
  ('7f312000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-00000000000a', 'NT_ACB312', 'ACB 312', 'BANK', '10000000-0000-4000-8000-000000000001');

do $test$
declare
  customer constant uuid := '7f312000-0000-4000-8000-000000000040';
  vcb constant uuid := '7f312000-0000-4000-8000-000000000002';
  acb constant uuid := '7f312000-0000-4000-8000-000000000003';
  failed text; op uuid := gen_random_uuid();
begin
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000001');
  failed := null;
  begin perform public.set_finance_account_bank_details('7f312000-0000-4000-8000-000000000001', 'Vietcombank', '0071000123456', 'Hien Xa', true, gen_random_uuid());
  exception when others then failed := sqlerrm; end;
  assert failed = 'bank_details_need_bank_account', 'cash has no bank details';
  failed := null;
  begin perform public.set_finance_account_bank_details(vcb, 'Vietcombank', '', 'Hiền Xa', true, gen_random_uuid()); exception when others then failed := sqlerrm; end;
  assert failed = 'bank_details_incomplete', 'shown needs every detail';
  assert public.set_finance_account_bank_details(vcb, 'Vietcombank', '0071 000 123 456', 'Công ty Hiền Xa', true, op) = vcb, 'saved';
  assert public.set_finance_account_bank_details(vcb, 'Vietcombank', '0071 000 123 456', 'Công ty Hiền Xa', true, op) = vcb, 'replay';
  assert (select bank_account_number = '0071000123456' and bank_account_holder = 'CÔNG TY HIỀN XA' and shown_to_customers from public.finance_accounts where id = vcb), 'normalised';
  -- Marking another account moves the mark: one shown account per branch.
  perform public.set_finance_account_bank_details(acb, 'ACB', '123456789', 'Hiền Xa', true, gen_random_uuid());
  assert (select count(*) = 1 from public.finance_accounts where shown_to_customers and branch_id = '20000000-0000-4000-8000-00000000000a'), 'one shown';

  perform pg_temp.act_as('7f312000-0000-4000-8000-0000000000a1');
  assert (select account_number = '123456789' and bank_name = 'ACB' from public.portal_payment_account(customer)), 'owner sees it';
  perform pg_temp.act_as('7f312000-0000-4000-8000-0000000000a2');
  failed := null;
  begin perform public.portal_payment_account(customer); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'receiver does not';
  perform pg_temp.act_as('10000000-0000-4000-8000-000000000003');
  failed := null;
  begin perform public.set_finance_account_bank_details(vcb, 'Vietcombank', '0071000123456', 'Hiền Xa', true, gen_random_uuid()); exception when others then failed := sqlstate; end;
  assert failed = '42501', 'needs finance.account.manage';
  perform pg_temp.act_as_admin();
end
$test$;
