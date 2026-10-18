-- B-1 follow-up: a signed-in user may read customers.source (self-registered badge); the hidden columns stay hidden.
do $test$
begin
  if not has_column_privilege('authenticated', 'public.customers', 'source', 'SELECT') then
    raise exception 'authenticated cannot read customers.source';
  end if;
  if has_column_privilege('authenticated', 'public.customers', 'credit_limit_vnd', 'SELECT')
    or has_column_privilege('authenticated', 'public.customers', 'internal_note', 'SELECT') then
    raise exception 'hidden customer columns became readable';
  end if;
  if has_column_privilege('anon', 'public.customers', 'source', 'SELECT') then
    raise exception 'anon can read customers.source';
  end if;
end
$test$;
