-- Serialize money before JSON parsing; preserve calculations, scope and historical rows.
begin;
do $money$
declare original text; patched text;
begin
 select pg_get_functiondef(p.oid) into original from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='finance_dashboard_detail';
 if original is null then raise exception 'finance_detail_contract_missing';end if;
 patched:=replace(original,'''amount_vnd'', amount_vnd','''amount_vnd'', amount_vnd::text');
 patched:=replace(patched,'''outstanding_amount_vnd'', outstanding_amount_vnd','''outstanding_amount_vnd'', outstanding_amount_vnd::text');
 if patched=original then raise exception 'finance_detail_money_projection_missing';end if;
 execute patched;
end $money$;
notify pgrst,'reload schema';
commit;
