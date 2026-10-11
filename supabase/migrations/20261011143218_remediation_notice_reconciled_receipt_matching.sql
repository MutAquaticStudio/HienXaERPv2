-- Notice acceptance is document review. Matching consumes already-reconciled receipt coverage, never cash or AR.
begin;
create table public.payment_notice_matches(
 id uuid primary key default gen_random_uuid(),notice_id uuid not null references public.payment_notices(id),branch_id uuid not null references public.branches(id),
 payment_id uuid not null references public.payments(id),reconciliation_match_id uuid not null references public.payment_reconciliation_matches(id),
 matched_amount_vnd bigint not null check(matched_amount_vnd>0),match_reason text not null check(char_length(trim(match_reason)) between 3 and 500),
 matched_by uuid not null references auth.users(id),matched_at timestamptz not null default now(),source_operation_id uuid not null unique
);
create index notice_match_notice_idx on public.payment_notice_matches(notice_id);
create index notice_match_reconciliation_idx on public.payment_notice_matches(reconciliation_match_id);
alter table public.payment_notice_matches enable row level security;
create policy notice_match_read on public.payment_notice_matches for select to authenticated using(private.has_permission(branch_id,'finance.payment_notice.review'));
grant select on public.payment_notice_matches to authenticated;revoke insert,update,delete on public.payment_notice_matches from authenticated,anon;
create trigger payment_notice_match_immutable before update or delete on public.payment_notice_matches for each row execute function private.reject_r7_posted_mutation();

create function public.match_payment_notice(target_notice_id uuid,target_reconciliation_match_id uuid,match_amount_vnd bigint,match_reason text,expected_notice_version integer,operation_id uuid)
 returns uuid language plpgsql security definer set search_path='' as $fn$
declare n public.payment_notices%rowtype;m public.payment_reconciliation_matches%rowtype;p public.payments%rowtype;r public.command_receipts%rowtype;h text;id uuid;used_notice bigint;used_match bigint;
begin
 select * into n from public.payment_notices where payment_notices.id=target_notice_id;
 if n.id is null or not private.has_permission(n.branch_id,'finance.payment_notice.review') or not private.has_permission(n.branch_id,'finance.reconcile') then raise exception 'forbidden_or_notice_not_found' using errcode='42501';end if;
 perform private.lock_saved_command_intent(operation_id,'match_payment_notice');perform pg_advisory_xact_lock(hashtextextended('notice_match:'||operation_id::text,0));
 h:=private.command_payload_hash(jsonb_build_array(target_notice_id,target_reconciliation_match_id,match_amount_vnd,trim(match_reason),expected_notice_version));
 select * into r from public.command_receipts where command_receipts.operation_id=match_payment_notice.operation_id;
 if found then if r.command_name<>'match_payment_notice' or r.payload_hash<>h or r.actor_auth_user_id is distinct from auth.uid() then raise exception 'operation_payload_conflict' using errcode='23505';end if;return r.result_entity_id;end if;
 select * into m from public.payment_reconciliation_matches where payment_reconciliation_matches.id=target_reconciliation_match_id;
 if m.id is null then raise exception 'recorded_bank_reconciliation_required' using errcode='23514';end if;
 select * into p from public.payments where payments.id=m.payment_id for update;
 select * into m from public.payment_reconciliation_matches where payment_reconciliation_matches.id=target_reconciliation_match_id for update;
 select * into n from public.payment_notices where payment_notices.id=target_notice_id for update;
 if n.version is distinct from expected_notice_version then raise exception 'stale_payment_notice_version' using errcode='PT409';end if;
 if operation_id is null or match_amount_vnd is null or match_amount_vnd<=0 or match_reason is null or char_length(trim(match_reason)) not between 3 and 500 then raise exception 'invalid_notice_match' using errcode='22023';end if;
 if n.review_state<>'ACCEPTED' then raise exception 'notice_document_review_not_accepted' using errcode='23514';end if;
 if p.id is null or p.direction<>'RECEIPT' or p.customer_id is distinct from n.customer_id or p.branch_id is distinct from n.branch_id or m.branch_id is distinct from n.branch_id
 or p.method<>'BANK_TRANSFER' or p.reversal_of_payment_id is not null or exists(select 1 from public.payments rev where rev.reversal_of_payment_id=p.id)
 then raise exception 'notice_receipt_scope_or_state_mismatch' using errcode='23514';end if;
 select coalesce(sum(x.matched_amount_vnd),0)::bigint into used_notice from public.payment_notice_matches x where x.notice_id=n.id;
 select coalesce(sum(x.matched_amount_vnd),0)::bigint into used_match from public.payment_notice_matches x where x.reconciliation_match_id=m.id;
 if used_notice+match_amount_vnd>n.declared_amount_vnd then raise exception 'notice_match_exceeds_declared_remaining' using errcode='23514';end if;
 if used_match+match_amount_vnd>m.matched_amount_vnd then raise exception 'notice_match_exceeds_reconciled_remaining' using errcode='23514';end if;
 insert into public.payment_notice_matches(notice_id,branch_id,payment_id,reconciliation_match_id,matched_amount_vnd,match_reason,matched_by,source_operation_id)
 values(n.id,n.branch_id,p.id,m.id,match_amount_vnd,trim(match_reason),auth.uid(),operation_id) returning payment_notice_matches.id into id;
 update public.payment_notices set version=version+1 where payment_notices.id=n.id;
 insert into public.command_receipts values(operation_id,auth.uid(),'match_payment_notice',h,'payment_notice_match',id,now());
 insert into public.audit_events(actor_auth_user_id,branch_id,action,entity_type,entity_id,trace_id,changed_fields,reason)
 values(auth.uid(),n.branch_id,'payment_notice.receipt_matched','payment_notice',n.id,operation_id,array['receipt_id','reconciliation_match_id','matched_amount','notice_version'],trim(match_reason));return id;
end $fn$;
revoke all on function public.match_payment_notice(uuid,uuid,bigint,text,integer,uuid) from public,anon;
grant execute on function public.match_payment_notice(uuid,uuid,bigint,text,integer,uuid) to authenticated;

create view public.payment_notice_reconciliation_source_read with(security_barrier=true) as
 select m.id,m.branch_id,p.id payment_id,p.customer_id,p.payment_number,m.statement_reference,m.statement_effective_at,
 m.matched_amount_vnd::text reconciled_amount_vnd,(m.matched_amount_vnd-coalesce(x.used,0))::text matching_available_vnd
 from public.payment_reconciliation_matches m join public.payments p on p.id=m.payment_id
 left join lateral(select sum(n.matched_amount_vnd)used from public.payment_notice_matches n where n.reconciliation_match_id=m.id)x on true
 where private.has_permission(m.branch_id,'finance.payment_notice.review') and private.has_permission(m.branch_id,'finance.reconcile')
 and p.direction='RECEIPT' and p.customer_id is not null and p.method='BANK_TRANSFER' and p.reversal_of_payment_id is null and not exists(select 1 from public.payments rev where rev.reversal_of_payment_id=p.id);
create view public.payment_notice_read with(security_barrier=true) as
 select n.id,n.branch_id,n.customer_id,c.display_name customer_name,n.evidence_id,n.declared_amount_vnd::text,n.paid_on,n.payment_reference,n.customer_note,n.review_state,n.version,n.submitted_at,n.review_note,
 coalesce(x.matched,0)::text matched_amount_vnd,(n.declared_amount_vnd-coalesce(x.matched,0))::text remaining_match_vnd,
 case when coalesce(x.invalid,0)>0 then 'SOURCE_REVERSED' when coalesce(x.matched,0)=n.declared_amount_vnd then 'MATCHED' when coalesce(x.matched,0)>0 then 'PARTIAL' else 'UNMATCHED' end money_match_state
 from public.payment_notices n join public.customers c on c.id=n.customer_id
 left join lateral(select sum(m.matched_amount_vnd)matched,count(*)filter(where exists(select 1 from public.payments rev where rev.reversal_of_payment_id=m.payment_id))invalid from public.payment_notice_matches m where m.notice_id=n.id)x on true
 where private.has_permission(n.branch_id,'finance.payment_notice.review');
grant select on public.payment_notice_reconciliation_source_read,public.payment_notice_read to authenticated;
notify pgrst,'reload schema';
commit;
