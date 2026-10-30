-- Security fix: 20261011083514 recreated public.earning_event_read with "create or replace view" and no WITH clause, which
-- dropped security_invoker. The view then ran with its owner's rights and skipped the RLS of earning_events, so any signed-in
-- account (staff without compensation.read, workers, customer portal accounts) could read every employee's earnings through
-- the API. Restore security_invoker so the reader's own RLS applies again.
begin;
alter view public.earning_event_read set (security_invoker = true);
commit;
