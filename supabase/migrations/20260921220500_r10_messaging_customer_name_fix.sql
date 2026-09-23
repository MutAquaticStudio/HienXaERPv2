do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_conversation(uuid,text,uuid,text,text,uuid,uuid[],uuid)'::regprocedure) into definition;
  if position('c.name ||' in definition) > 0 then
    execute replace(definition, 'c.name ||', 'c.display_name ||');
  end if;
  select pg_get_functiondef('public.messaging_participant_options(uuid,integer)'::regprocedure) into definition;
  if position('c.name ||' in definition) > 0 then
    execute replace(definition, 'c.name ||', 'c.display_name ||');
  end if;
end
$$;
