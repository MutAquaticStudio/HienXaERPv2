begin;
-- The Realtime QA failure was not a workforce permission failure. The original
-- self-row policy already permits identity reads. Retire the diagnostic RPC;
-- keep the applied migration history immutable and retain all existing rights.
drop function public.current_employee_identity();
commit;
