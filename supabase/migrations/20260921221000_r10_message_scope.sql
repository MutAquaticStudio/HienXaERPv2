create or replace function public.conversation_list_for_scope(
  target_branch_id uuid,
  target_customer_id uuid,
  before_updated_at timestamptz,
  before_id uuid,
  page_size integer
)
returns table(
  conversation_id uuid,
  branch_id uuid,
  audience text,
  customer_id uuid,
  subject text,
  entity_type text,
  entity_id uuid,
  participant_summary text,
  last_message_preview text,
  last_message_at timestamptz,
  updated_at timestamptz,
  unread_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare bounded_size integer;
begin
  if (target_branch_id is null) = (target_customer_id is null) then
    raise exception 'conversation_scope_invalid' using errcode = '22023';
  end if;
  if target_branch_id is not null and not private.has_branch_access(target_branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if target_customer_id is not null and not exists (
    select 1 from public.customer_portal_memberships m
    where m.customer_id = target_customer_id and m.auth_user_id = (select auth.uid()) and m.active
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  bounded_size := least(50, greatest(1, coalesce(page_size, 25)));
  return query
    select c.id, c.branch_id, c.audience, c.customer_id, c.subject, c.entity_type, c.entity_id,
      c.participant_summary, c.last_message_preview, c.last_message_at, c.updated_at, p.unread_count
    from public.conversation_participants p
    join public.conversations c on c.id = p.conversation_id
    where p.auth_user_id = (select auth.uid()) and p.active
      and ((target_branch_id is not null and c.branch_id = target_branch_id)
        or (target_customer_id is not null and c.customer_id = target_customer_id and c.audience = 'CUSTOMER'))
      and (before_updated_at is null or (c.updated_at, c.id) < (before_updated_at, before_id))
    order by c.updated_at desc, c.id desc
    limit bounded_size;
end
$$;

revoke all on function public.conversation_list_for_scope(uuid,uuid,timestamptz,uuid,integer) from public, anon, authenticated;
grant execute on function public.conversation_list_for_scope(uuid,uuid,timestamptz,uuid,integer) to authenticated;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_conversation(uuid,text,uuid,text,text,uuid,uuid[],uuid)'::regprocedure) into definition;
  if position('if target_audience = ''CUSTOMER'' then' in definition) > 0
    and position('private.has_permission(target_branch_id, ''customers.read'')' in definition) = 0 then
    execute replace(
      definition,
      'if target_audience = ''CUSTOMER'' then',
      'if target_audience = ''CUSTOMER'' then
    if not private.has_permission(target_branch_id, ''customers.read'') then
      raise exception ''forbidden'' using errcode = ''42501'';
    end if;'
    );
  end if;
  select pg_get_functiondef('public.messaging_participant_options(uuid,integer)'::regprocedure) into definition;
  if position('where c.branch_id = target_branch_id and m.active' in definition) > 0
    and position('private.has_permission(target_branch_id, ''customers.read'')' in definition) = 0 then
    execute replace(
      definition,
      'where c.branch_id = target_branch_id and m.active',
      'where c.branch_id = target_branch_id and m.active and private.has_permission(target_branch_id, ''customers.read'')'
    );
  end if;
end
$$;
