-- FB5 (Owner 18/10/2026): purchase prices split over the material's units, vehicle capacity read through unit conversions
-- (no capacity evidence note), and how much of each order line a truck can carry.
begin;

-- One purchase price typed in one unit, saved together with the prices it implies for the material's other units ("1 bao
-- 80.000 ₫" → also 1 tấn, 1 kg). Every rule goes through save_purchase_price_rule with all its checks, in one transaction:
-- one refused rule saves none of them.
create or replace function public.save_purchase_price_rules(target_branch_id uuid, rules jsonb, change_reason text, operation_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  hash text;
  receipt public.command_receipts%rowtype;
  item jsonb;
  item_no integer;
  saved jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or target_branch_id is null or not private.has_permission(target_branch_id, 'purchasing.price.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if save_purchase_price_rules.operation_id is null or jsonb_typeof(rules) is distinct from 'array' or jsonb_array_length(rules) not between 1 and 20 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  hash := private.command_payload_hash(jsonb_build_object('branch', target_branch_id, 'rules', rules, 'reason', change_reason));
  perform pg_advisory_xact_lock(hashtextextended(save_purchase_price_rules.operation_id::text, 0));
  select * into receipt from public.command_receipts r where r.operation_id = save_purchase_price_rules.operation_id;
  if found then
    if receipt.command_name <> 'save_purchase_price_rules' or receipt.payload_hash <> hash or receipt.actor_auth_user_id is distinct from auth.uid() then
      raise exception 'operation_payload_conflict' using errcode = '23505';
    end if;
    return (select jsonb_agg(value->'target_id' order by ordinality) from jsonb_array_elements(rules) with ordinality);
  end if;
  for item, item_no in select value, ordinality from jsonb_array_elements(rules) with ordinality loop
    if jsonb_typeof(item) is distinct from 'object' or (item->>'target_id') is null
      or exists (select 1 from jsonb_object_keys(item) key where key <> all(array['target_id', 'supersedes_id', 'expected_version', 'values'])) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    saved := saved || to_jsonb(public.save_purchase_price_rule((item->>'target_id')::uuid, target_branch_id, (item->>'supersedes_id')::uuid,
      (item->>'expected_version')::integer, item->'values', change_reason, md5(save_purchase_price_rules.operation_id::text || ':' || item_no)::uuid));
  end loop;
  insert into public.command_receipts values (save_purchase_price_rules.operation_id, auth.uid(), 'save_purchase_price_rules', hash,
    'purchase_price_rule', (rules->0->>'target_id')::uuid, now());
  return saved;
end
$function$;

revoke all on function public.save_purchase_price_rules(uuid, jsonb, text, uuid) from public, anon;

grant execute on function public.save_purchase_price_rules(uuid, jsonb, text, uuid) to authenticated;

commit;
