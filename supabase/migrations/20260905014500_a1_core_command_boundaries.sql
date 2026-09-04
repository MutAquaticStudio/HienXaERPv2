-- HIỀN XA ERP A1 — keep portal adapters outside canonical core transitions.
-- CP1 may authorize a customer acceptance, but P4 owns the state change itself.

create or replace function app_private.accept_quotation(
  p_revision_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_revision public.quotation_revisions%rowtype;
  target_quotation public.quotations%rowtype;
begin
  if p_actor_id is null then
    raise exception 'QUOTATION_ACCEPTOR_REQUIRED' using errcode = '42501';
  end if;

  select * into target_revision
  from public.quotation_revisions
  where id = p_revision_id
  for update;
  if not found then
    raise exception 'QUOTATION_REVISION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into target_quotation
  from public.quotations
  where id = target_revision.quotation_id
  for update;
  if not found then
    raise exception 'QUOTATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_quotation.active_revision_id <> target_revision.id then
    raise exception 'QUOTATION_REVISION_NOT_ACTIVE' using errcode = '23514';
  end if;

  if target_revision.status = 'ACCEPTED' then
    return target_quotation.id;
  end if;
  if target_revision.status <> 'SENT' then
    raise exception 'QUOTATION_NOT_ACCEPTABLE' using errcode = '23514';
  end if;

  update public.quotation_revisions
  set status = 'ACCEPTED', accepted_at = now()
  where id = target_revision.id;
  update public.quotations
  set status = 'ACCEPTED'
  where id = target_quotation.id;
  return target_quotation.id;
end;
$$;

-- CP1 remains an authorization/idempotency/audit adapter. It no longer owns
-- P4 quotation state and therefore cannot become a portal-only transition.
create or replace function app_private.customer_portal_accept_quotation(
  p_revision_id uuid,
  p_idempotency_key text,
  p_actor_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  portal_customer_id uuid;
  target_revision public.quotation_revisions%rowtype;
  target_quotation public.quotations%rowtype;
  acceptance_id uuid;
begin
  if coalesce(p_idempotency_key, '') !~ '^[A-Za-z0-9_-]{12,128}$' then
    raise exception 'CUSTOMER_PORTAL_IDEMPOTENCY_INVALID' using errcode = '22000';
  end if;
  portal_customer_id := app_private.customer_portal_customer_id(p_actor_id);
  if portal_customer_id is null then
    raise exception 'CUSTOMER_PORTAL_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;

  select * into target_revision
  from public.quotation_revisions
  where id = p_revision_id
  for update;
  if not found then
    raise exception 'QUOTATION_REVISION_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into target_quotation
  from public.quotations
  where id = target_revision.quotation_id
  for update;
  if target_quotation.customer_id <> portal_customer_id
    or target_quotation.active_revision_id <> p_revision_id then
    raise exception 'CUSTOMER_PORTAL_RESOURCE_DENIED' using errcode = '42501';
  end if;

  select id into acceptance_id
  from public.customer_portal_quote_acceptances
  where quotation_revision_id = p_revision_id;
  if acceptance_id is not null then
    return acceptance_id;
  end if;

  perform app_private.accept_quotation(p_revision_id, p_actor_id);
  insert into public.customer_portal_quote_acceptances (
    customer_id, quotation_revision_id, accepted_by, idempotency_key
  ) values (
    portal_customer_id, p_revision_id, p_actor_id, p_idempotency_key
  ) returning id into acceptance_id;
  perform app_private.customer_portal_append_audit(
    p_actor_id,
    'CUSTOMER_QUOTATION_ACCEPTED',
    'quotation_revision',
    p_revision_id,
    jsonb_build_object('customer_id', portal_customer_id)
  );
  return acceptance_id;
end;
$$;

revoke all on function app_private.accept_quotation(uuid, uuid)
from public, anon, authenticated;
revoke all on function app_private.customer_portal_accept_quotation(uuid, text, uuid)
from public, anon, authenticated;
