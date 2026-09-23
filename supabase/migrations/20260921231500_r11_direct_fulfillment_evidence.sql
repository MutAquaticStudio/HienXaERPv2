do $$
declare definition text;
begin
  select pg_get_functiondef('public.register_purchase_invoice_source(uuid,text,date,uuid)'::regprocedure) into definition;
  if position('source_id := obligation.supplier_fulfillment_id;' in definition) > 0
    and position('from public.supplier_fulfillments f' in definition) = 0 then
    execute replace(
      definition,
      'source_id := obligation.supplier_fulfillment_id;',
      'source_id := obligation.supplier_fulfillment_id;
    select f.evidence_object_id into evidence_id from public.supplier_fulfillments f
      where f.id = source_id and f.branch_id = obligation.branch_id;'
    );
  end if;
end
$$;
