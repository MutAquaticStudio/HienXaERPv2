-- Supabase's Automatic RLS project setting installs this event-trigger function.
-- Event triggers invoke it internally, so API roles do not need EXECUTE access.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
