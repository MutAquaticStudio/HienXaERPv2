-- B-1 follow-up: customers grants columns one by one, and Customer 360 / the customer list read the new customers.source
-- ("Tự đăng ký"). Without this grant the select fails and the customer page answers 404. Credit limit and internal note stay
-- hidden as before.
begin;

grant select (source) on public.customers to authenticated;

notify pgrst, 'reload schema';

commit;
