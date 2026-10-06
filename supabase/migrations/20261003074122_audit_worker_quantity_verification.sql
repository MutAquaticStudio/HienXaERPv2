-- Owner may verify a different accepted quantity without rewriting the worker's report.
-- Existing command, result/verification records and audit reason are reused.
do $owner_reason$
declare definition text; original text; needle text;
begin
  select pg_get_functiondef('public.verify_delivery(uuid,jsonb,integer,uuid)'::regprocedure) into definition;
  original := definition;
  needle := 'reason := nullif(trim(item->>''billing_variance_reason''), '''');';
  if strpos(definition, needle) = 0 then raise exception 'verify_delivery adjustment guard anchor missing'; end if;
  definition := replace(definition, needle, needle || E'\n' || $guard$
    if result.source_work_item_result_id is not null and accepted is distinct from result_line.actual_base_quantity then
      if coalesce(length(trim(item->>'verification_adjustment_reason')),0) not between 3 and 500 then
        raise exception 'worker_quantity_adjustment_reason_required' using errcode='22023';
      end if;
    end if;
  $guard$);
  needle := 'trace_id, changed_fields)';
  if strpos(definition, needle) = 0 then raise exception 'verify_delivery audit column anchor missing'; end if;
  definition := replace(definition, needle, 'trace_id, changed_fields, reason)');
  needle := 'array[''inventory'',''receivable'',''revenue'',''direct_cost'']';
  if strpos(definition, needle) = 0 then raise exception 'verify_delivery audit value anchor missing'; end if;
  definition := replace(definition, needle, needle || $audit$
    , case when result.source_work_item_result_id is not null then (
      select string_agg((correction.item->>'delivery_line_id') || ': ' || trim(correction.item->>'verification_adjustment_reason'), '; ' order by correction.item->>'delivery_line_id')
      from jsonb_array_elements(verification_lines) as correction(item)
      join public.delivery_result_lines reported on reported.delivery_result_id=result.id
        and reported.delivery_line_id=(correction.item->>'delivery_line_id')::uuid
      where (correction.item->>'accepted_base_quantity')::numeric is distinct from reported.actual_base_quantity
    ) else null end
  $audit$);
  if definition=original then raise exception 'verify_delivery unchanged'; end if;
  execute definition;
end
$owner_reason$;
